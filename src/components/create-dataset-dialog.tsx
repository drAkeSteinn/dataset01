'use client';

import { useState } from 'react';
import { FolderOpen, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateDataset } from '@/hooks/use-datasets';
import { useAppStore } from '@/stores/app-store';
import type { CaptionStyle } from '@/types';

interface CreateDatasetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateDatasetDialog({ open, onOpenChange }: CreateDatasetDialogProps) {
  const { setActiveDatasetId } = useAppStore();
  const createDataset = useCreateDataset();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerWord, setTriggerWord] = useState('');
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>('tags');
  const [importPath, setImportPath] = useState('');

  const handleSubmit = async () => {
    if (!name.trim()) return;

    try {
      const dataset = await createDataset.mutateAsync({
        name: name.trim(),
        description: description.trim(),
        triggerWord: triggerWord.trim(),
        captionStyle,
        importPath: importPath.trim() || undefined,
      });

      setActiveDatasetId(dataset.id);
      resetForm();
      onOpenChange(false);
    } catch {
      // Error is shown via toast by the mutation
    }
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setTriggerWord('');
    setCaptionStyle('tags');
    setImportPath('');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crear nuevo dataset</DialogTitle>
          <DialogDescription>
            Create a new dataset for LoRA training. You can import images from an existing folder.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="dataset-name">Nombre *</Label>
            <Input
              id="dataset-name"
              placeholder="My Character Dataset"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dataset-description">Descripción</Label>
            <Textarea
              id="dataset-description"
              placeholder="Describe this dataset..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="trigger-word">Trigger word</Label>
            <Input
              id="trigger-word"
              placeholder="e.g. xyz123"
              value={triggerWord}
              onChange={(e) => setTriggerWord(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Unique identifier for the LoRA concept
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="caption-style">Estilo de caption</Label>
            <Select value={captionStyle} onValueChange={(v) => setCaptionStyle(v as CaptionStyle)}>
              <SelectTrigger id="caption-style">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="natural">Natural Language</SelectItem>
                <SelectItem value="tags">Tag-based (Comma Separated)</SelectItem>
                <SelectItem value="custom">Custom Template</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="import-path">Import from Folder</Label>
            <div className="flex gap-2">
              <Input
                id="import-path"
                placeholder="/path/to/images"
                value={importPath}
                onChange={(e) => setImportPath(e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={() => {
                  // In a real app this would open a file picker dialog
                  // For now, user types the path manually
                }}
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Scan existing folder for images with optional .txt captions
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || createDataset.isPending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {createDataset.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Crear dataset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
