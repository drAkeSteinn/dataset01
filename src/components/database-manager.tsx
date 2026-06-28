'use client';

import { useState, useCallback } from 'react';
import { Download, Upload, Loader2, Database, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

interface DatabaseManagerProps {
  onClose?: () => void;
}

export function DatabaseManager({ onClose }: DatabaseManagerProps) {
  const [status, setStatus] = useState<{ exists: boolean; path: string; sizeFormatted: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useState<HTMLInputElement | null>(null);

  const checkStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/database');
      const data = await res.json();
      setStatus(data);
    } catch {
      setMessage({ type: 'error', text: 'Failed to check database status' });
    } finally {
      setLoading(false);
    }
  }, []);

  const handleExport = async () => {
    try {
      const res = await fetch('/api/database/export');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tirano-captions-${new Date().toISOString().split('T')[0]}.db`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: 'Database exported successfully' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Export failed' });
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('database', file);

      const res = await fetch('/api/database', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Import failed');
      }

      setMessage({ type: 'success', text: 'Database imported. Please restart the app.' });
      // Refresh status
      await checkStatus();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Import failed' });
    } finally {
      setImporting(false);
      // Reset input
      if (e.target) e.target.value = '';
    }
  };

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Database Management</h3>
      </div>

      <p className="text-xs text-muted-foreground">
        Export your database to transfer it to another computer, or import an existing database file.
        The database contains all datasets, images, captions, and settings.
      </p>

      {/* Status */}
      <div className="rounded-lg border bg-muted/50 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">Status</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={checkStatus}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Refresh'}
          </Button>
        </div>
        {status ? (
          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              {status.exists ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5 text-yellow-600" />
              )}
              <span>{status.exists ? 'Database exists' : 'Database not found (will be created on first use)'}</span>
            </div>
            {status.exists && (
              <>
                <div>Size: {status.sizeFormatted}</div>
                <div className="truncate" title={status.path}>Path: {status.path}</div>
              </>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Click Refresh to check status</p>
        )}
      </div>

      {/* Export */}
      <div className="space-y-2">
        <Label className="text-xs">Export Database</Label>
        <p className="text-xs text-muted-foreground">
          Download the current database file to transfer or backup.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={handleExport}
          disabled={!status?.exists}
        >
          <Download className="mr-2 h-3.5 w-3.5" />
          Export Database
        </Button>
      </div>

      <Separator />

      {/* Import */}
      <div className="space-y-2">
        <Label className="text-xs">Import Database</Label>
        <p className="text-xs text-muted-foreground">
          Replace the current database with an imported .db file. A backup of the current database will be created automatically.
        </p>
        <Input
          ref={fileInputRef as React.RefObject<HTMLInputElement>}
          type="file"
          accept=".db,.sqlite"
          onChange={handleImport}
          disabled={importing}
          className="text-xs"
        />
        {importing && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" />
            Importing...
          </p>
        )}
      </div>

      {/* Message */}
      {message && (
        <div className={`text-xs p-2 rounded-md ${
          message.type === 'success'
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      <Separator />

      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
        <p className="text-xs text-yellow-800">
          <strong>Note:</strong> After importing a database, you need to restart the application for changes to take effect.
        </p>
      </div>
    </div>
  );
}
