"use client";

import { useEffect, useState } from "react";

const BORDER = "#E0E0E0";

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileKey(file: File, index: number) {
  return `${file.name}-${file.size}-${file.lastModified}-${index}`;
}

function useFilePreviewUrls(files: File[]) {
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);

  useEffect(() => {
    const urls = files.map((file) =>
      isImageFile(file) ? URL.createObjectURL(file) : "",
    );
    setPreviewUrls(urls);
    return () => {
      urls.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [files]);

  return previewUrls;
}

function CloudIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M7 18a4 4 0 0 1-1.97-7.48 5 5 0 0 1 9.38-2.32A3.5 3.5 0 1 1 17 18H7Z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DocumentFileIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14 3H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8l-6-5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M14 3v5h5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RemoveButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-zinc-600 shadow-sm ring-1 ring-black/10 transition hover:bg-zinc-50 hover:text-zinc-900"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path
          d="M3 3l6 6M9 3L3 9"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

export type FileUploadFieldProps = {
  label: string;
  files: File[];
  onFilesAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  accept?: string;
  variant: "photo" | "document";
};

export function FileUploadField({
  label,
  files,
  onFilesAdd,
  onRemove,
  inputRef,
  accept,
  variant,
}: FileUploadFieldProps) {
  const previewUrls = useFilePreviewUrls(files);
  const hasFiles = files.length > 0;

  const ingest = (list: FileList | null) => {
    if (!list?.length) return;
    onFilesAdd(Array.from(list));
    if (inputRef.current) inputRef.current.value = "";
  };

  const onDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const onDrop = (e: React.DragEvent) => {
    onDrag(e);
    ingest(e.dataTransfer.files);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] text-black">{label}</span>
      <div
        className={
          hasFiles
            ? "overflow-hidden rounded-md border bg-white"
            : "overflow-hidden rounded-md border border-dashed bg-white"
        }
        style={{ borderColor: BORDER }}
      >
        {hasFiles && variant === "photo" ? (
          <div
            className="border-b p-3"
            style={{ borderColor: BORDER }}
            role="list"
            aria-label="Photo previews"
          >
            <div className="grid grid-cols-2 gap-3">
              {files.map((file, index) => {
                const url = previewUrls[index];
                if (!url) return null;
                return (
                  <div
                    key={fileKey(file, index)}
                    role="listitem"
                    className="relative"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={file.name}
                      className="aspect-[4/3] w-full rounded-md object-cover ring-1 ring-black/5"
                    />
                    <div className="absolute right-2 top-2">
                      <RemoveButton
                        label={`Remove ${file.name}`}
                        onClick={() => onRemove(index)}
                      />
                    </div>
                    <p className="mt-1 truncate text-[11px] text-zinc-500">
                      {file.name}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {hasFiles && variant === "document" ? (
          <ul
            className="divide-y"
            style={{ borderColor: BORDER }}
            role="list"
            aria-label="Document previews"
          >
            {files.map((file, index) => {
              const url = previewUrls[index];
              const image = isImageFile(file) && url;
              return (
                <li
                  key={fileKey(file, index)}
                  className="flex items-center gap-3 px-3 py-2.5"
                >
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-zinc-50 text-zinc-400"
                    style={{ borderColor: BORDER }}
                  >
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <DocumentFileIcon />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] text-zinc-900">
                      {file.name}
                    </p>
                    <p className="text-[12px] text-zinc-500">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-[13px] text-zinc-500 hover:text-zinc-900"
                    onClick={() => onRemove(index)}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        <label
          onDragOver={onDrag}
          onDrop={onDrop}
          className={
            hasFiles
              ? "flex cursor-pointer items-center justify-center gap-2 border-t px-4 py-3 text-center"
              : "flex min-h-[100px] cursor-pointer flex-col items-center justify-center gap-2 px-4 py-6 text-center"
          }
          style={hasFiles ? { borderColor: BORDER } : undefined}
        >
          {hasFiles ? (
            <>
              <CloudIcon className="text-zinc-400" />
              <span className="text-[13px] text-blue-600 hover:underline">
                Add more files
              </span>
            </>
          ) : (
            <>
              <CloudIcon className="text-zinc-400" />
              <span className="text-[14px] text-zinc-600">
                Drop files here or{" "}
                <span className="text-blue-600 underline">browse</span>
              </span>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="sr-only"
            multiple
            onChange={(e) => ingest(e.target.files)}
          />
        </label>
      </div>
    </div>
  );
}
