
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Save, Bot, Key, Globe, Sparkles, PauseCircle, Wrench, Box, Copy, Check, List, GripVertical, Filter, LayoutTemplate, RefreshCw } from 'lucide-react';
import { AIConfig, LinkItem, Category, SiteSettings } from '../types';
import { generateLinkDescription } from '../services/geminiService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AIConfig;
  siteSettings: SiteSettings;
  onSave: (config: AIConfig, siteSettings: SiteSettings) => void;
  links: LinkItem[];
  categories: Category[];
  onUpdateLinks: (links: LinkItem[]) => void;
}

// 辅助函数：生成 SVG Data URI 图标 (修复了中文崩溃问题)
const generateSvgIcon = (text: string, style: 'blue' | 'purple' | 'orange' | 'dark' | 'green') => {
    const char = (text && text.length > 0 ? text.charAt(0) : 'C').toUpperCase();
    let bg = '';
    let fg = 'white';
    
    switch(style) {
        case 'blue': 
            bg = '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#2563eb"/></linearGradient>'; 
            break;
        case 'purple': 
            bg = '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#8b5cf6"/><stop offset="100%" stop-color="#7c3aed"/></linearGradient>'; 
            break;
        case 'orange': 
            bg = '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#d97706"/></linearGradient>'; 
            break;
        case 'green':
            bg = '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#10b981"/><stop offset="100%" stop-color="#059669"/></linearGradient>';
            break;
        case 'dark': 
            bg = '<rect width="100%" height="100%" fill="#1e293b"/>'; 
            break;
    }

    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
        ${bg.includes('gradient') ? '<defs>' + bg + '</defs><rect width="100%" height="100%" fill="url(#g)" rx="16"/>' : bg.replace('rect', 'rect rx="16"')}
        <text x="50%" y="50%" dy=".35em" fill="${fg}" font-family="Arial, sans-serif" font-weight="bold" font-size="32" text-anchor="middle">${char}</text>
    </svg>`.trim();

    try {
        const encoded = window.btoa(unescape(encodeURIComponent(svg)));
        return `data:image/svg+xml;base64,${encoded}`;
    } catch (e) {
        console.error("SVG Icon Generation Failed", e);
        return '';
    }
};

const SettingsModal: React.FC<SettingsModalProps> = ({ 
    isOpen, onClose, config, siteSettings, onSave, links, categories, onUpdateLinks 
}) => {
  const [activeTab, setActiveTab] = useState<'site' | 'ai' | 'tools' | 'links'>('site');
  const [localConfig, setLocalConfig] = useState<AIConfig>(config);
  
  const [localSiteSettings, setLocalSiteSettings] = useState<SiteSettings>(() => ({
      title: siteSettings?.title || 'CloudNav - 我的导航',
      navTitle: siteSettings?.navTitle || 'CloudNav',
      favicon: siteSettings?.favicon || '',
      cardStyle: siteSettings?.cardStyle || 'detailed'
  }));
  
  const [generatedIcons, setGeneratedIcons] = useState<string[]>([]);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const shouldStopRef = useRef(false);

  // Tools State
  const [password, setPassword] = useState('');
  const [domain, setDomain] = useState('');
  const [browserType, setBrowserType] = useState<'chrome' | 'firefox'>('chrome');
  
  // Link Management State
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  
  const availableCategories = useMemo(() => {
      const catIds = Array.from(new Set(links.map(l => l.categoryId)));
      return catIds;
  }, [links]);

  const [copiedStates, setCopiedStates] = useState<{[key: string]: boolean}>({});

  const updateGeneratedIcons = (text: string) => {
      const styles: any[] = ['blue', 'purple', 'orange', 'green', 'dark'];
      const icons = styles.map(s => generateSvgIcon(text, s));
      setGeneratedIcons(icons);
  };

  useEffect(() => {
    if (isOpen) {
      setLocalConfig(config);
      const safeSettings = {
          title: siteSettings?.title || 'CloudNav - 我的导航',
          navTitle: siteSettings?.navTitle || 'CloudNav',
          favicon: siteSettings?.favicon || '',
          cardStyle: siteSettings?.cardStyle || 'detailed'
      };
      setLocalSiteSettings(safeSettings);
      updateGeneratedIcons(safeSettings.navTitle);

      setIsProcessing(false);
      setProgress({ current: 0, total: 0 });
      shouldStopRef.current = false;
      setDomain(window.location.origin);
      const storedToken = localStorage.getItem('cloudnav_auth_token');
      if (storedToken) setPassword(storedToken);
      setDraggedId(null);
      setFilterCategory('all');
    }
  }, [isOpen, config, siteSettings]);

  const handleChange = (key: keyof AIConfig, value: string) => {
    setLocalConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleSiteChange = (key: keyof SiteSettings, value: string) => {
    setLocalSiteSettings(prev => {
        const next = { ...prev, [key]: value };
        if (key === 'navTitle') {
            updateGeneratedIcons(value);
        }
        return next;
    });
  };

  const handleSave = () => {
    onSave(localConfig, localSiteSettings);
    onClose();
  };

  const handleBulkGenerate = async () => {
    if (!localConfig.apiKey) {
        alert("请先配置并保存 API Key");
        return;
    }

    const missingLinks = links.filter(l => !l.description);
    if (missingLinks.length === 0) {
        alert("所有链接都已有描述！");
        return;
    }

    if (!confirm(`发现 ${missingLinks.length} 个链接缺少描述，确定要使用 AI 自动生成吗？这可能需要一些时间。`)) return;

    setIsProcessing(true);
    shouldStopRef.current = false;
    setProgress({ current: 0, total: missingLinks.length });
    
    let currentLinks = [...links];

    for (let i = 0; i < missingLinks.length; i++) {
        if (shouldStopRef.current) break;

        const link = missingLinks[i];
        try {
            const desc = await generateLinkDescription(link.title, link.url, localConfig);
            currentLinks = currentLinks.map(l => l.id === link.id ? { ...l, description: desc } : l);
            onUpdateLinks(currentLinks);
            setProgress({ current: i + 1, total: missingLinks.length });
        } catch (e) {
            console.error(`Failed to generate for ${link.title}`, e);
        }
    }

    setIsProcessing(false);
  };

  const handleCopy = (text: string, key: string) => {
      navigator.clipboard.writeText(text);
      setCopiedStates(prev => ({ ...prev, [key]: true }));
      setTimeout(() => {
          setCopiedStates(prev => ({ ...prev, [key]: false }));
      }, 2000);
  };

  // --- Drag and Drop Logic ---

  const handleDragStart = (e: React.DragEvent, id: string) => {
      setDraggedId(id);
      e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
      e.preventDefault(); 
      if (!draggedId || draggedId === targetId) return;
      
      const newLinks = [...links];
      const sourceIndex = newLinks.findIndex(l => l.id === draggedId);
      const targetIndex = newLinks.findIndex(l => l.id === targetId);

      if (sourceIndex === -1 || targetIndex === -1) return;

      const [movedItem] = newLinks.splice(sourceIndex, 1);
      newLinks.splice(targetIndex, 0, movedItem);
      
      onUpdateLinks(newLinks);
  };

  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setDraggedId(null);
  };

  const filteredLinks = useMemo(() => {
      if (filterCategory === 'all') return links;
      return links.filter(l => l.categoryId === filterCategory);
  }, [links, filterCategory]);

  // Extension Generators
  const chromeManifest = `{
  "manifest_version": 3,
  "name": "CloudNav Assistant",
  "version": "1.0",
  "permissions": ["activeTab", "scripting"],
  "action": {
    "default_popup": "popup.html",
    "default_title": "Save to CloudNav"
  },
  "icons": {
     "128": "https://lucide.dev/favicon.ico" 
  }
}`;

  const firefoxManifest = `{
  "manifest_version": 3,
  "name": "CloudNav Assistant",
  "version": "1.0",
  "permissions": ["activeTab"],
  "browser_specific_settings": {
    "gecko": {
      "id": "cloudnav@example.com",
      "strict_min_version": "109.0"
    }
  },
  "action": {
    "default_popup": "popup.html",
    "default_title": "Save to CloudNav"
  }
}`;

  const extPopupHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { width: 300px; font-family: sans-serif; padding: 12px; }
    h3 { margin: 0 0 10px 0; font-size: 16px; color: #333; }
    button { width: 100%; padding: 8px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500; }
    button:hover { background: #2563eb; }
    .status { margin-top: 10px; font-size: 12px; text-align: center; color: #666; min-height: 16px; }
    .page-info { font-size: 12px; color: #64748b; margin-bottom: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: #f1f5f9; padding: 6px; border-radius: 4px; }
  </style>
</head>
<body>
  <h3>CloudNav</h3>
  <div class="page-info" id="page-title">Loading...</div>
  <button id="save-btn">保存到 CloudNav</button>
  <div id="status" class="status"></div>
  <script src="popup.js"></script>
</body>
</html>`;

  const extPopupJs = `const CONFIG = {
  apiBase: "${domain}",
  password: "${password}"
};

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    document.getElementById('page-title').textContent = tab.title;

    document.getElementById('save-btn').addEventListener('click', async () => {
      const status = document.getElementById('status');
      status.textContent = 'Saving...';
      
      try {
        const res = await fetch(\`\${CONFIG.apiBase}/api/link\`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-auth-password': CONFIG.password
          },
          body: JSON.stringify({
            title: tab.title,
            url: tab.url,
            categoryId: '' // Auto-detect
          })
        });

        if (res.ok) {
          const data = await res.json();
          status.textContent = '已保存！分类: ' + (data.categoryName || '默认');
          status.style.color = '#16a34a';
          setTimeout(() => window.close(), 1500);
        } else {
          status.textContent = 'Error: ' + res.status;
          status.style.color = '#dc2626';
        }
      } catch (e) {
        status.textContent = 'Network Error';
        status.style.color = '#dc2626';
      }
    });
  } catch(e) {
     document.getElementById('status').textContent = "Extension Error: " + e.message;
  }
});`;

  const renderCodeBlock = (filename: string, code: string) => (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-700/50 px-3 py-2 border-b border-slate-200 dark:border-slate-700">
            <span className="text-xs font-mono font-medium text-slate-600 dark:text-slate-300">{filename}</span>
            <button 
                onClick={() => handleCopy(code, filename)}
                className="text-xs flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
            >
                {copiedStates[filename] ? <Check size={12}/> : <Copy size={12}/>}
                {copiedStates[filename] ? 'Copied' : 'Copy'}
            </button>
        </div>
        <div className="bg-slate-900 p-3 overflow-x-auto">
            <pre className="text-[10px] md:text-xs font-mono text-slate-300 leading-relaxed whitespace-pre">
                {code}
            </pre>
        </div>
    </div>
  );

  if (!isOpen) return null;

  const tabs = [
    { id: 'site', label: '网站设置', icon: LayoutTemplate },
    { id: 'ai', label: 'AI 设置', icon: Bot },
    { id: 'links', label: '链接管理', icon: List },
    { id: 'tools', label: '扩展工具', icon: Wrench },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-700 flex flex-col max-h-[90vh]">
        
        <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div className="flex gap-4 overflow-x-auto no-scrollbar">
              {tabs.map(tab => (
                 <button 
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`text-sm font-semibold flex items-center gap-2 pb-1 transition-colors whitespace-nowrap ${activeTab === tab.id ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-500' : 'text-slate-500 dark:text-slate-400'}`}
                  >
                    <tab.icon size={18} /> {tab.label}
                  </button>
              ))}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
            <X className="w-5 h-5 dark:text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto min-h-[300px] flex-1">
            
            {activeTab === 'site' && (
                <div className="space-y-4">
                     <div>
                        <h4 className="font-medium text-slate-800 dark:text-slate-200 mb-1 flex items-center gap-2">
                           <LayoutTemplate size={16} className="text-blue-500"/> 基础外观
                        </h4>
                        <p className="text-xs text-slate-500 mb-4">定制您的专属导航站风格</p>
                        
                        <div className="space-y-5">
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">网页导航名称 (Navbar Name)</label>
                                <input
                                    type="text"
                                    value={localSiteSettings.navTitle}
                                    onChange={(e) => handleSiteChange('navTitle', e.target.value)}
                                    placeholder="CloudNav"
                                    className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                />
                                <p className="text-[10px] text-slate-400 mt-1">网站左上角的名称，将用于生成图标首字母</p>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-2">网站图标 (Favicon)</label>
                                
                                {/* Generated Icons Selection */}
                                <div className="mb-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Sparkles size={12} className="text-purple-500"/>
                                        <p className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">自动生成 (点击应用):</p>
                                    </div>
                                    <div className="flex gap-3 overflow-x-auto pb-2">
                                        {generatedIcons.map((icon, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => handleSiteChange('favicon', icon)}
                                                className={`shrink-0 w-10 h-10 rounded-xl overflow-hidden border-2 transition-all shadow-sm ${localSiteSettings.favicon === icon ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-900 scale-110' : 'border-transparent hover:border-slate-300 dark:hover:border-slate-600'}`}
                                            >
                                                <img src={icon} className="w-full h-full object-cover" />
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <div className="shrink-0 w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 flex items-center justify-center overflow-hidden">
                                        {localSiteSettings.favicon ? (
                                            <img src={localSiteSettings.favicon} className="w-full h-full object-contain" onError={(e) => e.currentTarget.style.display='none'} />
                                        ) : (
                                            <Globe size={18} className="text-slate-400"/>
                                        )}
                                    </div>
                                    <input
                                        type="text"
                                        value={localSiteSettings.favicon}
                                        onChange={(e) => handleSiteChange('favicon', e.target.value)}
                                        placeholder="或者输入自定义图片 URL..."
                                        className="flex-1 p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    />
                                </div>
                            </div>
                            
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">浏览器标签标题 (Title)</label>
                                <input
                                    type="text"
                                    value={localSiteSettings.title}
                                    onChange={(e) => handleSiteChange('title', e.target.value)}
                                    placeholder="CloudNav - 我的导航"
                                    className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                />
                            </div>
                        </div>
                     </div>
                </div>
            )}

            {activeTab === 'ai' && (
                <>
                    {/* Provider Selection */}
                    <div>
                        <label className="block text-sm font-medium mb-2 dark:text-slate-300">API 提供商</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => handleChange('provider', 'gemini')}
                                className={`flex items-center justify-center gap-2 p-3 rounded-lg border transition-all ${
                                    localConfig.provider === 'gemini'
                                    ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/30 dark:border-blue-500 dark:text-blue-300'
                                    : 'border-slate-200 dark:border-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                                }`}
                            >
                                <span className="font-semibold">Google Gemini</span>
                            </button>
                            <button
                                onClick={() => handleChange('provider', 'openai')}
                                className={`flex items-center justify-center gap-2 p-3 rounded-lg border transition-all ${
                                    localConfig.provider === 'openai'
                                    ? 'bg-purple-50 border-purple-500 text-purple-700 dark:bg-purple-900/30 dark:border-purple-500 dark:text-purple-300'
                                    : 'border-slate-200 dark:border-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                                }`}
                            >
                                <span className="font-semibold">OpenAI 兼容</span>
                            </button>
                        </div>
                    </div>

                    {/* Model Config */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                                <Key size={12}/> API Key
                            </label>
                            <input
                                type="password"
                                value={localConfig.apiKey}
                                onChange={(e) => handleChange('apiKey', e.target.value)}
                                placeholder="sk-..."
                                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            />
                        </div>

                        {localConfig.provider === 'openai' && (
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                                    <Globe size={12}/> Base URL (API 地址)
                                </label>
                                <input
                                    type="text"
                                    value={localConfig.baseUrl}
                                    onChange={(e) => handleChange('baseUrl', e.target.value)}
                                    placeholder="https://api.openai.com/v1"
                                    className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                />
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                                <Sparkles size={12}/> 模型名称
                            </label>
                            <input
                                type="text"
                                value={localConfig.model}
                                onChange={(e) => handleChange('model', e.target.value)}
                                placeholder={localConfig.provider === 'gemini' ? "gemini-2.5-flash" : "gpt-3.5-turbo"}
                                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            />
                        </div>
                    </div>

                    {/* Bulk Actions */}
                    <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                        <button
                            onClick={handleBulkGenerate}
                            className="w-full py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:border-blue-500 hover:text-blue-500 dark:hover:text-blue-400 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                        >
                            <Sparkles size={16} /> 一键补全所有描述
                        </button>
                    </div>
                </>
            )}

            {activeTab === 'links' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                         <p className="text-xs text-slate-500">拖拽调整顺序</p>
                         <div className="flex items-center gap-2">
                             <Filter size={14} className="text-slate-400" />
                             <select 
                                value={filterCategory}
                                onChange={(e) => setFilterCategory(e.target.value)}
                                className="text-sm p-1.5 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none"
                             >
                                <option value="all">所有分类</option>
                                {availableCategories.map(catId => (
                                    <option key={catId} value={catId}>
                                        {categories.find(c => c.id === catId)?.name || catId}
                                    </option>
                                ))}
                             </select>
                         </div>
                    </div>

                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                        {filteredLinks.map((link) => (
                            <div 
                                key={link.id} 
                                draggable
                                onDragStart={(e) => handleDragStart(e, link.id)}
                                onDragOver={(e) => handleDragOver(e, link.id)}
                                onDrop={handleDrop}
                                className={`flex items-center gap-3 p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg group cursor-move transition-all border ${
                                    draggedId === link.id ? 'opacity-50 border-blue-500 border-dashed' : 'border-transparent hover:border-slate-200 dark:hover:border-slate-600'
                                }`}
                            >
                                <div className="text-slate-400 cursor-move">
                                    <GripVertical size={16} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm truncate dark:text-slate-200">{link.title}</div>
                                    <div className="text-xs text-slate-400 truncate">{link.url}</div>
                                </div>
                                <div className="text-xs text-slate-400 px-2 bg-slate-200 dark:bg-slate-800 rounded">
                                     {categories.find(c => c.id === link.categoryId)?.name || link.categoryId}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === 'tools' && (
                <div className="space-y-6">
                    {/* Step 1: Password */}
                    <div className="space-y-3">
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                            第一步：输入访问密码
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-mono tracking-widest"
                            placeholder="部署时设置的 PASSWORD"
                        />
                    </div>
                    
                    {/* Step 2: Browser Selection */}
                    <div className="space-y-3">
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                            第二步：选择浏览器类型
                        </label>
                        <div className="flex gap-4">
                            <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${browserType === 'chrome' ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/30 dark:border-blue-500 dark:text-blue-300' : 'border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                                <input type="radio" className="hidden" checked={browserType === 'chrome'} onChange={() => setBrowserType('chrome')} />
                                <span className="font-semibold text-sm">Chrome / Edge</span>
                            </label>
                            <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${browserType === 'firefox' ? 'bg-orange-50 border-orange-500 text-orange-700 dark:bg-orange-900/30 dark:border-orange-500 dark:text-orange-300' : 'border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                                <input type="radio" className="hidden" checked={browserType === 'firefox'} onChange={() => setBrowserType('firefox')} />
                                <span className="font-semibold text-sm">Mozilla Firefox</span>
                            </label>
                        </div>
                    </div>
                    
                    {/* Step 3: Instructions & Code */}
                    <div className="space-y-4">
                        <h4 className="text-sm font-medium dark:text-slate-200 flex items-center gap-2">
                           <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs">3</span>
                           配置步骤与代码
                        </h4>
                        
                        <div className="text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700 leading-relaxed">
                            <p className="font-semibold mb-1 text-slate-700 dark:text-slate-300">安装指南 ({browserType === 'chrome' ? 'Chrome/Edge' : 'Firefox'}):</p>
                            <ol className="list-decimal pl-4 space-y-1">
                                <li>在电脑上新建一个文件夹，命名为 <code>CloudNav-Ext</code>。</li>
                                <li>在文件夹中创建以下 3 个文件，分别复制下方的代码粘贴进去。</li>
                                {browserType === 'chrome' ? (
                                    <>
                                        <li>打开浏览器扩展管理页面 (Chrome: <code>chrome://extensions</code>, Edge: <code>edge://extensions</code>)。</li>
                                        <li>开启右上角的 <strong>"开发者模式"</strong>。</li>
                                        <li>点击 <strong>"加载已解压的扩展程序"</strong>，选择刚才创建的文件夹。</li>
                                    </>
                                ) : (
                                    <>
                                        <li>打开 Firefox，输入 <code>about:debugging#/runtime/this-firefox</code>。</li>
                                        <li>点击 <strong>"临时载入附加组件"</strong>。</li>
                                        <li>选择文件夹中的 <code>manifest.json</code> 文件。</li>
                                    </>
                                )}
                            </ol>
                        </div>
                        
                        {renderCodeBlock('manifest.json', browserType === 'chrome' ? chromeManifest : firefoxManifest)}
                        {renderCodeBlock('popup.html', extPopupHtml)}
                        {renderCodeBlock('popup.js', extPopupJs)}
                    </div>
                </div>
            )}

        </div>

        {activeTab === 'ai' || activeTab === 'site' ? (
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3 shrink-0">
                <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">取消</button>
                <button 
                    onClick={handleSave}
                    className="px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2 font-medium"
                >
                    <Save size={16} /> 保存设置
                </button>
            </div>
        ) : null}
      </div>
    </div>
  );
};

export default SettingsModal;
