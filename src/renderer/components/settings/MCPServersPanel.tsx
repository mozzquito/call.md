/**
 * MCP Servers Panel Component
 *
 * Settings panel for managing MCP server connections.
 * Allows adding, editing, and removing MCP servers.
 */

import React, { useState, useEffect } from 'react';
import { ScrollArea } from '../ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../ui/alert-dialog';
import {
  Plus,
  Pencil,
  Trash2,
  Server,
  Wifi,
  WifiOff,
  Loader2,
  AlertCircle,
  Check,
  RefreshCw,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';
import { useMCP } from '../../hooks/useMCP';
import type { MCPServerConfig, MCPServerTemplate } from '../../../preload/index';

// Toggle Component
function Toggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`w-[38px] h-[22px] rounded-full relative transition-colors ${
        enabled ? 'bg-primary' : 'bg-muted-foreground/30'
      }`}
    >
      <div
        className={`absolute size-[18px] bg-primary-foreground rounded-full top-[2px] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.15)] transition-all ${
          enabled ? 'left-[18px]' : 'left-[2px]'
        }`}
      />
    </button>
  );
}

// Custom Select Component
function CustomSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; description?: string }[];
  placeholder?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find((o) => o.value === value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-[12px] py-[10px] text-[14px] bg-card border border-border rounded-[10px] outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors text-left"
      >
        <span className={selectedOption ? 'text-foreground' : 'text-muted-foreground'}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown className={`h-[14px] w-[14px] text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="absolute z-50 w-full mt-[4px] bg-card border border-border rounded-[10px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] overflow-hidden">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full px-[12px] py-[10px] text-left hover:bg-secondary transition-colors ${
                option.value === value ? 'bg-accent' : ''
              }`}
            >
              <div className="flex items-center gap-[8px]">
                <Server className="h-[14px] w-[14px] text-muted-foreground" />
                <span className="text-[14px] text-foreground">{option.label}</span>
              </div>
              {option.description && (
                <p className="text-[12px] text-muted-foreground mt-[2px] ml-[22px]">{option.description}</p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Server Card Component

interface ServerCardProps {
  server: MCPServerConfig;
  connectionState?: { status: string; error?: string };
  onEdit: (server: MCPServerConfig) => void;
  onDelete: (serverId: string) => void;
  onConnect: (serverId: string) => void;
  onDisconnect: (serverId: string) => void;
  onToggleEnabled: (serverId: string, enabled: boolean) => void;
  isConnecting?: boolean;
}

function ServerCard({
  server,
  connectionState,
  onEdit,
  onDelete,
  onConnect,
  onDisconnect,
  onToggleEnabled,
  isConnecting,
}: ServerCardProps) {
  const status = connectionState?.status || 'disconnected';

  const getStatusBadge = () => {
    switch (status) {
      case 'connected':
        return (
          <div className="flex items-center gap-[4px] px-[8px] py-[3px] bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-[6px]">
            <Wifi className="h-[12px] w-[12px] text-emerald-600 dark:text-emerald-400" />
            <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Connected</span>
          </div>
        );
      case 'connecting':
        return (
          <div className="flex items-center gap-[4px] px-[8px] py-[3px] bg-accent border border-primary/30 rounded-[6px] animate-pulse">
            <Loader2 className="h-[12px] w-[12px] text-primary animate-spin" />
            <span className="text-[11px] font-medium text-primary">Connecting</span>
          </div>
        );
      case 'error':
        return (
          <div className="flex items-center gap-[4px] px-[8px] py-[3px] bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-[6px]">
            <AlertCircle className="h-[12px] w-[12px] text-red-600 dark:text-red-400" />
            <span className="text-[11px] font-medium text-red-600 dark:text-red-400">Error</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-[4px] px-[8px] py-[3px] bg-secondary border border-border rounded-[6px]">
            <WifiOff className="h-[12px] w-[12px] text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground">Disconnected</span>
          </div>
        );
    }
  };

  return (
    <div className={`bg-card border border-border rounded-[12px] shadow-[0px_1.272px_15.267px_0px_rgba(0,0,0,0.05)] transition-all ${!server.isEnabled ? 'opacity-60' : ''}`}>
      <div className="px-[16px] py-[14px]">
        <div className="flex items-start justify-between gap-[12px] mb-[12px]">
          <div className="flex-1 min-w-0 overflow-hidden">
            <div className="flex items-center gap-[8px] mb-[4px]">
              <Server className="h-[16px] w-[16px] text-muted-foreground flex-shrink-0" />
              <h4 className="text-[14px] font-semibold text-foreground truncate">{server.name}</h4>
            </div>
            <p className="text-[12px] text-muted-foreground truncate">
              {server.transport === 'stdio' ? server.command : server.url}
            </p>
          </div>
          <div className="flex-shrink-0">{getStatusBadge()}</div>
        </div>

        {connectionState?.error && (
          <div className="p-[8px] bg-red-50 dark:bg-red-950/30 rounded-[8px] mb-[12px]">
            <p className="text-[12px] text-red-600 dark:text-red-400">{connectionState.error}</p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-[12px]">
            <div className="flex items-center gap-[6px]">
              <Toggle
                enabled={server.isEnabled}
                onChange={(checked) => onToggleEnabled(server.id, checked)}
              />
              <span className="text-[12px] text-muted-foreground">Enabled</span>
            </div>
            <div className="px-[8px] py-[2px] bg-secondary border border-border rounded-[6px]">
              <span className="text-[11px] font-medium text-muted-foreground">{server.transport}</span>
            </div>
            {server.autoConnect && (
              <div className="px-[8px] py-[2px] bg-accent border border-primary/30 rounded-[6px]">
                <span className="text-[11px] font-medium text-primary">Auto-connect</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-[4px]">
            {status === 'connected' ? (
              <button
                onClick={() => onDisconnect(server.id)}
                disabled={isConnecting}
                className="px-[12px] py-[6px] border border-border rounded-[8px] text-[12px] font-medium text-muted-foreground hover:bg-secondary transition-colors disabled:opacity-50"
              >
                Disconnect
              </button>
            ) : (
              <button
                onClick={() => onConnect(server.id)}
                disabled={isConnecting || !server.isEnabled}
                className="px-[12px] py-[6px] bg-primary hover:bg-primary/90 rounded-[8px] text-[12px] font-medium text-white transition-colors disabled:opacity-50"
              >
                {isConnecting ? (
                  <Loader2 className="h-[14px] w-[14px] animate-spin" />
                ) : (
                  'Connect'
                )}
              </button>
            )}
            <button
              onClick={() => onEdit(server)}
              className="w-[32px] h-[32px] flex items-center justify-center rounded-[8px] hover:bg-secondary transition-colors"
            >
              <Pencil className="h-[14px] w-[14px] text-muted-foreground" />
            </button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="w-[32px] h-[32px] flex items-center justify-center rounded-[8px] hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                  <Trash2 className="h-[14px] w-[14px] text-red-600 dark:text-red-400" />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Server</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{server.name}"? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => onDelete(server.id)}
                    className="bg-red-500 hover:bg-red-600"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
    </div>
  );
}

// Add Server Dialog

interface AddServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: MCPServerTemplate[];
  editingServer?: MCPServerConfig | null;
  onSubmit: (data: any) => Promise<void>;
}

function AddServerDialog({
  open,
  onOpenChange,
  templates,
  editingServer,
  onSubmit,
}: AddServerDialogProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [form, setForm] = useState({
    name: '',
    transport: 'stdio' as 'stdio' | 'http',
    command: '',
    args: '',
    url: '',
    env: {} as Record<string, string>,
    headers: {} as Record<string, string>,
    isEnabled: true,
    autoConnect: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (editingServer) {
      setForm({
        name: editingServer.name,
        transport: editingServer.transport,
        command: editingServer.command || '',
        args: editingServer.args?.join(' ') || '',
        url: editingServer.url || '',
        env: {},
        headers: {},
        isEnabled: editingServer.isEnabled,
        autoConnect: editingServer.autoConnect,
      });
      setSelectedTemplate(editingServer.templateId || '');
    } else {
      setForm({
        name: '',
        transport: 'stdio',
        command: '',
        args: '',
        url: '',
        env: {},
        headers: {},
        isEnabled: true,
        autoConnect: false,
      });
      setSelectedTemplate('');
    }
  }, [editingServer, open]);

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      setForm({
        ...form,
        name: template.name,
        transport: template.transport,
        command: template.defaultCommand || '',
        args: template.defaultArgs?.join(' ') || '',
        url: template.defaultUrl || '',
      });
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onSubmit({
        name: form.name,
        transport: form.transport,
        command: form.transport === 'stdio' ? form.command : undefined,
        args: form.transport === 'stdio' && form.args
          ? form.args.split(' ').filter(Boolean)
          : undefined,
        url: form.transport === 'http' ? form.url : undefined,
        env: Object.keys(form.env).length > 0 ? form.env : undefined,
        headers: Object.keys(form.headers).length > 0 ? form.headers : undefined,
        templateId: selectedTemplate || undefined,
        isEnabled: form.isEnabled,
        autoConnect: form.autoConnect,
      });
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedTemplateData = templates.find((t) => t.id === selectedTemplate);

  const templateOptions = templates.map((t) => ({
    value: t.id,
    label: t.name,
    description: t.description,
  }));

  const transportOptions = [
    { value: 'stdio', label: 'Stdio (Local Process)' },
    { value: 'http', label: 'HTTP/SSE (Remote)' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="shrink-0 px-[24px] pt-[24px] pb-[16px] border-b border-border">
          <DialogTitle className="text-[18px] font-semibold text-foreground">
            {editingServer ? 'Edit MCP Server' : 'Add MCP Server'}
          </DialogTitle>
          <DialogDescription className="text-[13px] text-muted-foreground">
            {editingServer
              ? 'Update the server configuration.'
              : 'Connect to an MCP server for CRM, docs, or other integrations.'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-[16px] px-[24px] py-[20px]">
          {/* Template Selection */}
          {!editingServer && (
            <div className="space-y-[6px]">
              <label className="text-[13px] font-medium text-foreground">Start from template (optional)</label>
              <CustomSelect
                value={selectedTemplate}
                onChange={handleTemplateSelect}
                options={templateOptions}
                placeholder="Choose a template..."
              />
              {selectedTemplateData && (
                <p className="text-[12px] text-muted-foreground">{selectedTemplateData.description}</p>
              )}
            </div>
          )}

          {/* Name */}
          <div className="space-y-[6px]">
            <label className="text-[13px] font-medium text-foreground">Server Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., HubSpot CRM"
              className="w-full px-[12px] py-[10px] text-[14px] text-foreground bg-card border border-border rounded-[10px] outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors placeholder:text-muted-foreground"
            />
          </div>

          {/* Transport Type */}
          <div className="space-y-[6px]">
            <label className="text-[13px] font-medium text-foreground">Transport Type</label>
            <CustomSelect
              value={form.transport}
              onChange={(v) => setForm({ ...form, transport: v as 'stdio' | 'http' })}
              options={transportOptions}
            />
          </div>

          {/* Stdio Config */}
          {form.transport === 'stdio' && (
            <>
              <div className="space-y-[6px]">
                <label className="text-[13px] font-medium text-foreground">Command</label>
                <input
                  type="text"
                  value={form.command}
                  onChange={(e) => setForm({ ...form, command: e.target.value })}
                  placeholder="e.g., npx"
                  className="w-full px-[12px] py-[10px] text-[14px] text-foreground bg-card border border-border rounded-[10px] outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors placeholder:text-muted-foreground"
                />
              </div>
              <div className="space-y-[6px]">
                <label className="text-[13px] font-medium text-foreground">Arguments (space-separated)</label>
                <input
                  type="text"
                  value={form.args}
                  onChange={(e) => setForm({ ...form, args: e.target.value })}
                  placeholder="e.g., -y @modelcontextprotocol/server-memory"
                  className="w-full px-[12px] py-[10px] text-[14px] text-foreground bg-card border border-border rounded-[10px] outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors placeholder:text-muted-foreground"
                />
              </div>

              {/* Environment Variables for STDIO */}
              <div className="p-[16px] bg-secondary rounded-[12px] border border-border">
                <div className="flex items-center justify-between mb-[12px]">
                  <div>
                    <p className="text-[13px] font-medium text-foreground">Environment Variables</p>
                    <p className="text-[12px] text-muted-foreground mt-[2px]">
                      Add environment variables for the process (e.g., API_KEY, CODA_TOKEN)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const key = `ENV_VAR_${Object.keys(form.env).length + 1}`;
                      setForm({
                        ...form,
                        env: { ...form.env, [key]: '' },
                      });
                    }}
                    className="flex items-center gap-[4px] px-[10px] py-[6px] border border-border rounded-[8px] bg-card hover:bg-secondary text-[12px] font-medium text-muted-foreground transition-colors"
                  >
                    <Plus className="h-[12px] w-[12px]" />
                    Add Variable
                  </button>
                </div>
                {Object.keys(form.env).length > 0 && (
                  <div className="space-y-[8px]">
                    {Object.entries(form.env).map(([key, value], index) => (
                      <div key={index} className="flex gap-[8px] items-center">
                        <input
                          type="text"
                          placeholder="Variable name (e.g., API_KEY)"
                          value={key}
                          onChange={(e) => {
                            const newEnv = { ...form.env };
                            delete newEnv[key];
                            newEnv[e.target.value] = value;
                            setForm({ ...form, env: newEnv });
                          }}
                          className="flex-1 px-[10px] py-[8px] text-[13px] text-foreground bg-card border border-border rounded-[8px] outline-none focus:border-primary font-mono placeholder:text-muted-foreground"
                        />
                        <input
                          type="password"
                          placeholder="Value (stored securely)"
                          value={value}
                          onChange={(e) => {
                            setForm({
                              ...form,
                              env: { ...form.env, [key]: e.target.value },
                            });
                          }}
                          className="flex-1 px-[10px] py-[8px] text-[13px] text-foreground bg-card border border-border rounded-[8px] outline-none focus:border-primary placeholder:text-muted-foreground"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newEnv = { ...form.env };
                            delete newEnv[key];
                            setForm({ ...form, env: newEnv });
                          }}
                          className="w-[32px] h-[32px] flex items-center justify-center rounded-[8px] hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                        >
                          <Trash2 className="h-[14px] w-[14px] text-red-600 dark:text-red-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {Object.keys(form.env).length === 0 && (
                  <p className="text-[12px] text-muted-foreground italic">
                    No environment variables configured
                  </p>
                )}
              </div>
            </>
          )}

          {/* HTTP Config */}
          {form.transport === 'http' && (
            <>
              <div className="space-y-[6px]">
                <label className="text-[13px] font-medium text-foreground">Server URL</label>
                <input
                  type="url"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="https://mcp-server.example.com"
                  className="w-full px-[12px] py-[10px] text-[14px] text-foreground bg-card border border-border rounded-[10px] outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors placeholder:text-muted-foreground"
                />
              </div>

              {/* Custom Headers */}
              <div className="p-[16px] bg-secondary rounded-[12px] border border-border">
                <div className="flex items-center justify-between mb-[12px]">
                  <div>
                    <p className="text-[13px] font-medium text-foreground">Custom Headers</p>
                    <p className="text-[12px] text-muted-foreground mt-[2px]">
                      Add custom HTTP headers for authentication (e.g., Authorization, X-API-Key)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const key = `Header-${Object.keys(form.headers).length + 1}`;
                      setForm({
                        ...form,
                        headers: { ...form.headers, [key]: '' },
                      });
                    }}
                    className="flex items-center gap-[4px] px-[10px] py-[6px] border border-border rounded-[8px] bg-card hover:bg-secondary text-[12px] font-medium text-muted-foreground transition-colors"
                  >
                    <Plus className="h-[12px] w-[12px]" />
                    Add Header
                  </button>
                </div>
                {Object.keys(form.headers).length > 0 && (
                  <div className="space-y-[8px]">
                    {Object.entries(form.headers).map(([key, value], index) => (
                      <div key={index} className="flex gap-[8px] items-center">
                        <input
                          type="text"
                          placeholder="Header name (e.g., Authorization)"
                          value={key}
                          onChange={(e) => {
                            const newHeaders = { ...form.headers };
                            delete newHeaders[key];
                            newHeaders[e.target.value] = value;
                            setForm({ ...form, headers: newHeaders });
                          }}
                          className="flex-1 px-[10px] py-[8px] text-[13px] text-foreground bg-card border border-border rounded-[8px] outline-none focus:border-primary font-mono placeholder:text-muted-foreground"
                        />
                        <input
                          type="password"
                          placeholder="Value (stored securely)"
                          value={value}
                          onChange={(e) => {
                            setForm({
                              ...form,
                              headers: { ...form.headers, [key]: e.target.value },
                            });
                          }}
                          className="flex-1 px-[10px] py-[8px] text-[13px] text-foreground bg-card border border-border rounded-[8px] outline-none focus:border-primary placeholder:text-muted-foreground"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newHeaders = { ...form.headers };
                            delete newHeaders[key];
                            setForm({ ...form, headers: newHeaders });
                          }}
                          className="w-[32px] h-[32px] flex items-center justify-center rounded-[8px] hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                        >
                          <Trash2 className="h-[14px] w-[14px] text-red-600 dark:text-red-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {Object.keys(form.headers).length === 0 && (
                  <p className="text-[12px] text-muted-foreground italic">
                    No custom headers configured
                  </p>
                )}
              </div>
            </>
          )}

          {/* Environment Variables (for templates that require them) */}
          {selectedTemplateData?.requiredEnvVars && selectedTemplateData.requiredEnvVars.length > 0 && (
            <div className="p-[16px] bg-accent rounded-[12px] border border-primary/30">
              <div className="mb-[12px]">
                <p className="text-[13px] font-medium text-primary">Required Credentials</p>
                <p className="text-[12px] text-primary mt-[2px]">
                  These credentials are required for this template to work
                </p>
              </div>
              <div className="space-y-[12px]">
                {selectedTemplateData.requiredEnvVars.map((envVar) => (
                  <div key={envVar.key} className="space-y-[6px]">
                    <label className="text-[13px] font-medium text-foreground">
                      {envVar.label}
                    </label>
                    <input
                      type={envVar.secret ? 'password' : 'text'}
                      value={form.env[envVar.key] || ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          env: { ...form.env, [envVar.key]: e.target.value },
                        })
                      }
                      placeholder={envVar.placeholder}
                      className="w-full px-[12px] py-[10px] text-[14px] text-foreground bg-card border border-border rounded-[10px] outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors placeholder:text-muted-foreground"
                    />
                    {envVar.description && (
                      <p className="text-[12px] text-muted-foreground">{envVar.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Options */}
          <div className="flex items-center gap-[24px] pt-[8px]">
            <div className="flex items-center gap-[8px]">
              <Toggle
                enabled={form.isEnabled}
                onChange={(checked) => setForm({ ...form, isEnabled: checked })}
              />
              <span className="text-[13px] text-foreground">Enabled</span>
            </div>
            <div className="flex items-center gap-[8px]">
              <Toggle
                enabled={form.autoConnect}
                onChange={(checked) => setForm({ ...form, autoConnect: checked })}
              />
              <span className="text-[13px] text-foreground">Auto-connect on startup</span>
            </div>
          </div>

          {/* Setup Instructions */}
          {selectedTemplateData?.setupInstructions && (
            <div className="p-[12px] bg-blue-50 dark:bg-blue-950/30 rounded-[10px] border border-blue-200 dark:border-blue-900">
              <p className="text-[13px] font-medium text-blue-700 dark:text-blue-300 mb-[4px]">
                Setup Instructions
              </p>
              <p className="text-[12px] text-blue-600 dark:text-blue-400 whitespace-pre-line">
                {selectedTemplateData.setupInstructions}
              </p>
              {selectedTemplateData.docsUrl && (
                <a
                  href={selectedTemplateData.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-[4px] mt-[8px]"
                >
                  View documentation
                  <ExternalLink className="h-[12px] w-[12px]" />
                </a>
              )}
            </div>
          )}
        </div>
        </ScrollArea>

        <DialogFooter className="shrink-0 px-[24px] py-[16px] border-t border-border gap-[8px]">
          <button
            onClick={() => onOpenChange(false)}
            className="px-[16px] py-[10px] border border-border rounded-[10px] text-[14px] font-medium text-muted-foreground hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !form.name}
            className="flex items-center gap-[6px] px-[16px] py-[10px] bg-primary hover:bg-primary/90 text-white text-[14px] font-medium rounded-[10px] transition-colors disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 className="h-[14px] w-[14px] animate-spin" />
            ) : editingServer ? (
              <Check className="h-[14px] w-[14px]" />
            ) : (
              <Plus className="h-[14px] w-[14px]" />
            )}
            {editingServer ? 'Save Changes' : 'Add Server'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Main Component

export function MCPServersPanel() {
  const {
    servers,
    templates,
    connectionStates,
    connectedServerCount,
    toolCount,
    loadData,
    createServer,
    updateServer,
    deleteServer,
    connect,
    disconnect,
  } = useMCP();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<MCPServerConfig | null>(null);
  const [connectingServers, setConnectingServers] = useState<Set<string>>(new Set());

  const handleConnect = async (serverId: string) => {
    setConnectingServers((prev) => new Set([...prev, serverId]));
    try {
      await connect(serverId);
    } finally {
      setConnectingServers((prev) => {
        const next = new Set(prev);
        next.delete(serverId);
        return next;
      });
    }
  };

  const handleDisconnect = async (serverId: string) => {
    await disconnect(serverId);
  };

  const handleToggleEnabled = async (serverId: string, enabled: boolean) => {
    await updateServer(serverId, { isEnabled: enabled });
  };

  const handleEdit = (server: MCPServerConfig) => {
    setEditingServer(server);
    setDialogOpen(true);
  };

  const handleDelete = async (serverId: string) => {
    await deleteServer(serverId);
  };

  const handleSubmit = async (data: any) => {
    if (editingServer) {
      await updateServer(editingServer.id, data);
    } else {
      await createServer(data);
    }
    setEditingServer(null);
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingServer(null);
    }
  };

  return (
    <div className="space-y-[16px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[16px] font-semibold text-foreground flex items-center gap-[8px]">
            <Server className="h-[18px] w-[18px]" />
            MCP Servers
          </h2>
          <p className="text-[13px] text-muted-foreground mt-[2px]">
            Connect external tools like CRMs, docs, and calendars
          </p>
        </div>
        <div className="flex items-center gap-[8px]">
          <div className="px-[10px] py-[4px] bg-secondary border border-border rounded-[8px]">
            <span className="text-[12px] font-medium text-muted-foreground">
              {connectedServerCount}/{servers.length} connected
            </span>
          </div>
          {toolCount > 0 && (
            <div className="px-[10px] py-[4px] bg-accent border border-primary/30 rounded-[8px]">
              <span className="text-[12px] font-medium text-primary">{toolCount} tools</span>
            </div>
          )}
          <button
            onClick={() => loadData()}
            className="w-[32px] h-[32px] flex items-center justify-center border border-border rounded-[8px] bg-card hover:bg-secondary transition-colors"
          >
            <RefreshCw className="h-[14px] w-[14px] text-muted-foreground" />
          </button>
          <button
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-[6px] px-[14px] py-[8px] bg-primary hover:bg-primary/90 text-white text-[13px] font-medium rounded-[8px] transition-colors"
          >
            <Plus className="h-[14px] w-[14px]" />
            Add Server
          </button>
        </div>
      </div>

      {/* Server List */}
      {servers.length === 0 ? (
        <div className="bg-card border border-border rounded-[12px] shadow-[0px_1.272px_15.267px_0px_rgba(0,0,0,0.05)]">
          <div className="flex flex-col items-center py-[48px] px-[20px]">
            <div className="w-[48px] h-[48px] flex items-center justify-center bg-secondary rounded-[12px] mb-[16px]">
              <Server className="h-[24px] w-[24px] text-muted-foreground" />
            </div>
            <h3 className="text-[15px] font-semibold text-foreground mb-[8px]">No MCP Servers Configured</h3>
            <p className="text-[13px] text-muted-foreground text-center max-w-[320px] mb-[16px]">
              Add MCP servers to connect CRMs, documentation, calendars, and other tools
              that provide contextual insights during calls.
            </p>
            <button
              onClick={() => setDialogOpen(true)}
              className="flex items-center gap-[6px] px-[16px] py-[10px] bg-primary hover:bg-primary/90 text-white text-[14px] font-medium rounded-[10px] transition-colors"
            >
              <Plus className="h-[14px] w-[14px]" />
              Add Your First Server
            </button>
          </div>
        </div>
      ) : (
        <ScrollArea className="h-[500px]">
          <div className="space-y-[12px] pr-[16px]">
            {servers.map((server) => (
              <ServerCard
                key={server.id}
                server={server}
                connectionState={connectionStates[server.id]}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                onToggleEnabled={handleToggleEnabled}
                isConnecting={connectingServers.has(server.id)}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Add/Edit Dialog */}
      <AddServerDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        templates={templates}
        editingServer={editingServer}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

export default MCPServersPanel;
