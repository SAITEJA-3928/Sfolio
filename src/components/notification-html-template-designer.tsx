import * as React from "react";
import { Editor } from "@tinymce/tinymce-react";
import type { Editor as TinyMceEditor } from "tinymce";
import { Button } from "@/components/ui";
import { Textarea } from "@/components/ui/textarea";
import { Code2, Eye, Pencil, SplitSquareHorizontal, Upload } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import "tinymce/tinymce";
import "tinymce/models/dom";
import "tinymce/themes/silver";
import "tinymce/icons/default";
import "tinymce/plugins/advlist";
import "tinymce/plugins/autolink";
import "tinymce/plugins/lists";
import "tinymce/plugins/link";
import "tinymce/plugins/table";
import "tinymce/skins/ui/oxide/skin.min.css";

type DesignerView = "split" | "editor" | "html" | "preview";

const PANEL_CONTENT_HEIGHT = "h-[420px]";

const TINYMCE_BASE_INIT = {
  height: 380,
  menubar: false,
  statusbar: false,
  promotion: false,
  branding: false,
  license_key: "gpl",
  plugins: ["advlist", "autolink", "lists", "link", "table"],
  toolbar:
    "undo redo | blocks | bold italic underline strikethrough | alignleft aligncenter alignright | bullist numlist | link | htmlsource",
  content_style:
    'body { font-family: Inter, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 14px; color: #003d2b; }',
  valid_elements: "*[*]",
  extended_valid_elements: "*[*]",
  verify_html: false,
  entity_encoding: "raw" as const,
  // Keep TinyMCE popups above Radix dialogs (z-50).
  base_z_index: 2000,
};

function createTinyMceInit(onOpenHtmlSource?: () => void) {
  return {
    ...TINYMCE_BASE_INIT,
    setup: (editor: TinyMceEditor) => {
      editor.ui.registry.addButton("htmlsource", {
        icon: "sourcecode",
        tooltip: "Edit full HTML source",
        onAction: () => onOpenHtmlSource?.(),
      });
    },
  };
}

type NotificationHtmlTemplateDesignerProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

export const NOTIFICATION_TEMPLATE_TOKENS = [
  "{{name}}",
  "{{title}}",
  "{{content}}",
  "{{goldPrice}}",
  "{{golddrop}}",
  "{{silverPrice}}",
  "{{silverdrop}}",
] as const;

export function extractTemplateVariables(html: string): string[] {
  const variables = new Set<string>();
  for (const match of html.matchAll(/\{\{(\w+)\}\}/g)) {
    variables.add(match[1]);
  }
  return Array.from(variables);
}

function resolveTemplateVariableValue(
  variables: Record<string, string>,
  token: string
) {
  const directValue = variables[token];
  if (directValue?.trim()) {
    return directValue.trim();
  }

  const matchedEntry = Object.entries(variables).find(
    ([key]) => key.toLowerCase() === token.toLowerCase()
  );

  return matchedEntry?.[1]?.trim() || "";
}

export function applyTemplateVariables(
  html: string,
  variables: Record<string, string>
) {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = resolveTemplateVariableValue(variables, key);
    return value || `{{${key}}}`;
  });
}

export function formatTemplateVariableLabel(variable: string) {
  return variable
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function wrapNotificationTemplatePreview(html: string) {
  const trimmed = html.trim();
  if (!trimmed) {
    return "<!DOCTYPE html><html><body style='font-family:sans-serif;padding:24px;color:#6b7280;'>Preview will appear here.</body></html>";
  }

  const previewHtml = trimmed.replace(
    /\{\{(\w+)\}\}/g,
    '<span class="token">{{$1}}</span>'
  );

  if (/<!doctype html|<html[\s>]/i.test(previewHtml)) {
    return previewHtml;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { margin: 0; padding: 16px; font-family: Arial, sans-serif; background: #f4f9f7; }
    .token {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 6px;
      background: rgba(0, 61, 43, 0.1);
      color: #003d2b;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.92em;
      font-weight: 700;
    }
    .price-label .token {
      background: rgba(255, 255, 255, 0.18);
      color: #ffffff;
    }
    .price-change .token {
      background: rgba(0, 61, 43, 0.08);
      color: #003d2b;
    }
  </style>
</head>
<body>${previewHtml}</body>
</html>`;
}

function extractBodyInnerHtml(html: string) {
  const match = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return match ? match[1].trim() : html;
}

function replaceBodyInnerHtml(fullHtml: string, innerHtml: string) {
  if (/<body[^>]*>[\s\S]*<\/body>/i.test(fullHtml)) {
    return fullHtml.replace(/(<body[^>]*>)[\s\S]*(<\/body>)/i, `$1${innerHtml}$2`);
  }

  return innerHtml;
}

function NotificationTinyMceEditor({
  value,
  onChange,
  onInsertSnippet,
  onOpenHtmlSource,
}: {
  value: string;
  onChange: (value: string) => void;
  onInsertSnippet: (insert: (snippet: string) => void) => void;
  onOpenHtmlSource?: () => void;
}) {
  const editorRef = React.useRef<TinyMceEditor | null>(null);
  const editorValue = React.useMemo(() => extractBodyInnerHtml(value), [value]);
  const editorInit = React.useMemo(
    () => createTinyMceInit(onOpenHtmlSource),
    [onOpenHtmlSource]
  );

  const insertSnippet = React.useCallback(
    (snippet: string) => {
      const editor = editorRef.current;
      if (editor) {
        editor.insertContent(snippet);
        return;
      }

      const nextBody = editorValue ? `${editorValue} ${snippet}` : snippet;
      onChange(replaceBodyInnerHtml(value, nextBody));
    },
    [editorValue, onChange, value]
  );

  React.useEffect(() => {
    onInsertSnippet(insertSnippet);
  }, [insertSnippet, onInsertSnippet]);

  React.useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const current = editor.getContent();
    if (current !== editorValue) {
      editor.setContent(editorValue);
    }
  }, [editorValue]);

  const handleEditorChange = React.useCallback(
    (content: string) => {
      onChange(replaceBodyInnerHtml(value, content));
    },
    [onChange, value]
  );

  return (
    <div
      className={cn(
        PANEL_CONTENT_HEIGHT,
        "notification-tinymce-editor overflow-hidden rounded-2xl border border-border bg-background"
      )}
    >
      <Editor
        licenseKey="gpl"
        value={editorValue}
        onInit={(_event, editor) => {
          editorRef.current = editor;
        }}
        onEditorChange={handleEditorChange}
        init={editorInit}
      />
    </div>
  );
}

export function NotificationHtmlTemplateDesigner({
  value,
  onChange,
  className,
}: NotificationHtmlTemplateDesignerProps) {
  const [view, setView] = React.useState<DesignerView>("split");
  const previewSource = React.useDeferredValue(value);
  const previewDocument = React.useMemo(
    () => wrapNotificationTemplatePreview(previewSource),
    [previewSource]
  );
  const insertSnippetRef = React.useRef<(snippet: string) => void>((snippet) => {
    onChange(value.trim() ? `${value}\n${snippet}` : snippet);
  });

  const registerInsertSnippet = React.useCallback((insert: (snippet: string) => void) => {
    insertSnippetRef.current = insert;
  }, []);

  const htmlFileInputRef = React.useRef<HTMLInputElement>(null);

  const insertSnippet = (snippet: string) => {
    if (view === "html") {
      onChange(value.trim() ? `${value}\n${snippet}` : snippet);
      return;
    }

    insertSnippetRef.current(snippet);
  };

  const handleImportHtmlFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".html") && !file.name.toLowerCase().endsWith(".htm")) {
      toast({
        title: "Invalid file",
        description: "Please choose an .html or .htm file.",
        variant: "destructive",
      });
      return;
    }

    try {
      const html = (await file.text()).trim();
      if (!html) {
        toast({
          title: "Empty file",
          description: "The selected HTML file has no content.",
          variant: "destructive",
        });
        return;
      }

      onChange(html);
      setView("html");
      toast({
        title: "HTML imported",
        description: `${file.name} loaded into the HTML source editor.`,
      });
    } catch {
      toast({
        title: "Import failed",
        description: "Could not read the selected HTML file.",
        variant: "destructive",
      });
    }
  };

  const getViewToggleButtonClass = (active: boolean) =>
    cn(
      "h-8 gap-1.5 px-3",
      active && "!text-white [&_svg]:!stroke-white [&_svg]:!text-white"
    );

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-xl border border-border bg-muted/30 p-1">
          <Button
            type="button"
            size="sm"
            variant={view === "split" ? "default" : "ghost"}
            className={getViewToggleButtonClass(view === "split")}
            onClick={() => setView("split")}
          >
            <SplitSquareHorizontal className="h-3.5 w-3.5" />
            Split
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view === "editor" ? "default" : "ghost"}
            className={getViewToggleButtonClass(view === "editor")}
            onClick={() => setView("editor")}
          >
            <Pencil className="h-3.5 w-3.5" />
            Editor
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view === "html" ? "default" : "ghost"}
            className={getViewToggleButtonClass(view === "html")}
            onClick={() => setView("html")}
          >
            <Code2 className="h-3.5 w-3.5" />
            HTML
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view === "preview" ? "default" : "ghost"}
            className={getViewToggleButtonClass(view === "preview")}
            onClick={() => setView("preview")}
          >
            <Eye className="h-3.5 w-3.5" />
            Preview
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={htmlFileInputRef}
            type="file"
            accept=".html,.htm,text/html"
            className="hidden"
            onChange={(event) => void handleImportHtmlFile(event)}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            onClick={() => htmlFileInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            Import HTML
          </Button>
        </div>
      </div>

      <div className="flex max-w-full flex-wrap gap-2">
        {NOTIFICATION_TEMPLATE_TOKENS.map((token) => (
          <button
            key={token}
            type="button"
            onClick={() => insertSnippet(token)}
            className="max-w-[9.5rem] break-all rounded-lg border border-border bg-background px-2.5 py-1 text-left text-xs font-medium leading-snug text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {token}
          </button>
        ))}
      </div>

      <div
        className={cn(
          "grid gap-4",
          view === "split" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"
        )}
      >
        {view !== "preview" ? (
          <div className="flex min-w-0 flex-col gap-2">
            <label className="text-sm font-medium text-foreground">
              {view === "html" ? "HTML Source" : "Visual Editor"}
            </label>
            {view === "html" ? (
              <>
                <Textarea
                  value={value}
                  onChange={(event) => onChange(event.target.value)}
                  spellCheck={false}
                  placeholder="<!DOCTYPE html>..."
                  className={cn(
                    PANEL_CONTENT_HEIGHT,
                    "resize-none rounded-2xl border-border bg-background font-mono text-xs leading-5"
                  )}
                />
              </>
            ) : (
              <>
                <NotificationTinyMceEditor
                  value={value}
                  onChange={onChange}
                  onInsertSnippet={registerInsertSnippet}
                  onOpenHtmlSource={() => setView("html")}
                />
                
              </>
            )}
          </div>
        ) : null}

        {view !== "editor" && view !== "html" ? (
          <div className="flex min-w-0 flex-col gap-2">
            <label className="text-sm font-medium text-foreground">Live Preview</label>
            <div
              className={cn(
                PANEL_CONTENT_HEIGHT,
                "overflow-hidden rounded-2xl border border-border bg-white"
              )}
            >
              <iframe
                title="Notification HTML preview"
                srcDoc={previewDocument}
                className="h-full w-full bg-[#f4f9f7]"
                sandbox=""
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
