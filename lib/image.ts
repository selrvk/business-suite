/**
 * Shrinks an image to fit within max × max pixels and re-encodes it, keeping
 * transparency. WebP where the browser can make it, PNG otherwise. Browser only.
 */
export async function shrinkImage(file: Blob, max = 512): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const encode = (type: string) => new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, 0.9))
  const webp = await encode("image/webp")
  if (webp?.type === "image/webp") return webp
  const png = await encode("image/png")
  if (!png) throw new Error("Couldn't read that image.")
  return png
}
