declare module 'heic-convert' {
  interface ConvertOptions {
    buffer: Buffer;
    format: 'JPEG';
    quality?: number;
  }
  export default function convert(options: ConvertOptions): Promise<Buffer>;
}
