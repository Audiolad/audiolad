declare module "*.webp" {
  const src: import("next/image").StaticImageData;
  export default src;
}
