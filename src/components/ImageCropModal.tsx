import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type ImageCropModalProps = {
  imageUrl: string;
  fileName: string;
  title?: string;
  onCancel: () => void;
  onApply: (file: File) => void | Promise<void>;
};

type CropMetrics = {
  naturalWidth: number;
  naturalHeight: number;
  displayWidth: number;
  displayHeight: number;
};

type Point = {
  x: number;
  y: number;
};

const CROP_SIZE = 320;
const OUTPUT_SIZE = 512;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getCroppedFileName(fileName: string): string {
  const cleanName = fileName.replace(/\.[^.]+$/, "").trim() || "voiceclub-image";
  return `${cleanName}-cropped.webp`;
}

export default function ImageCropModal({
  imageUrl,
  fileName,
  title = "Edit image",
  onCancel,
  onApply
}: ImageCropModalProps) {
  const [metrics, setMetrics] = useState<CropMetrics | null>(null);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{
    pointerX: number;
    pointerY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const imageRef = useRef<HTMLImageElement | null>(null);

  const cropBounds = useMemo(() => {
    if (!metrics) {
      return {
        minX: 0,
        maxX: 0,
        minY: 0,
        maxY: 0
      };
    }

    const minX = Math.min(0, CROP_SIZE - metrics.displayWidth);
    const minY = Math.min(0, CROP_SIZE - metrics.displayHeight);
    const maxX = Math.max(0, CROP_SIZE - metrics.displayWidth);
    const maxY = Math.max(0, CROP_SIZE - metrics.displayHeight);

    return { minX, maxX, minY, maxY };
  }, [metrics]);

  useEffect(() => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = imageUrl;

    image.onload = () => {
      const scale = Math.max(
        CROP_SIZE / image.naturalWidth,
        CROP_SIZE / image.naturalHeight
      );
      const displayWidth = image.naturalWidth * scale;
      const displayHeight = image.naturalHeight * scale;

      const nextMetrics = {
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        displayWidth,
        displayHeight
      };

      setMetrics(nextMetrics);
      setOffset({
        x: (CROP_SIZE - displayWidth) / 2,
        y: (CROP_SIZE - displayHeight) / 2
      });
    };

    image.onerror = () => {
      setErrorMessage("Could not load this image. Try another JPG, PNG, or WEBP file.");
    };
  }, [imageUrl]);

  function centerImage() {
    if (!metrics) return;

    setOffset({
      x: (CROP_SIZE - metrics.displayWidth) / 2,
      y: (CROP_SIZE - metrics.displayHeight) / 2
    });
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!metrics) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStart({
      pointerX: event.clientX,
      pointerY: event.clientY,
      offsetX: offset.x,
      offsetY: offset.y
    });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragStart || !metrics) return;

    const nextX = dragStart.offsetX + event.clientX - dragStart.pointerX;
    const nextY = dragStart.offsetY + event.clientY - dragStart.pointerY;

    setOffset({
      x: clamp(nextX, cropBounds.minX, cropBounds.maxX),
      y: clamp(nextY, cropBounds.minY, cropBounds.maxY)
    });
  }

  function handlePointerEnd() {
    setDragStart(null);
  }

  async function createCroppedFile(): Promise<File> {
    if (!metrics || !imageRef.current) {
      throw new Error("Image is not ready yet.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Could not prepare image crop.");
    }

    const scale = OUTPUT_SIZE / CROP_SIZE;

    context.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    context.drawImage(
      imageRef.current,
      offset.x * scale,
      offset.y * scale,
      metrics.displayWidth * scale,
      metrics.displayHeight * scale
    );

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/webp", 0.92);
    });

    if (!blob) {
      throw new Error("Could not crop this image.");
    }

    return new File([blob], getCroppedFileName(fileName), {
      type: "image/webp",
      lastModified: Date.now()
    });
  }

  async function applyCrop() {
    setSaving(true);
    setErrorMessage("");

    try {
      const croppedFile = await createCroppedFile();
      await onApply(croppedFile);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not crop image.";
      setErrorMessage(message);
      setSaving(false);
    }
  }

  return (
    <div className="image-crop-backdrop" onMouseDown={onCancel}>
      <div
        className="image-crop-modal"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="image-crop-header">
          <h3>{title}</h3>
          <button type="button" onClick={onCancel} title="Close image editor">
            <X size={18} />
          </button>
        </div>

        <div className="image-crop-body">
          <div
            className="image-crop-stage"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
          >
            {metrics && (
              <img
                ref={imageRef}
                src={imageUrl}
                alt="Crop preview"
                draggable={false}
                style={{
                  width: metrics.displayWidth,
                  height: metrics.displayHeight,
                  transform: `translate(${offset.x}px, ${offset.y}px)`
                }}
              />
            )}
          </div>
        </div>

        {errorMessage && <div className="image-crop-error">{errorMessage}</div>}

        <div className="image-crop-actions">
          <button
            type="button"
            className="image-crop-reset"
            onClick={centerImage}
            disabled={!metrics || saving}
          >
            Reset
          </button>

          <div>
            <button
              type="button"
              className="image-crop-cancel"
              onClick={onCancel}
              disabled={saving}
            >
              Cancel
            </button>

            <button
              type="button"
              className="image-crop-apply"
              onClick={applyCrop}
              disabled={!metrics || saving}
            >
              {saving ? "Applying..." : "Apply"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
