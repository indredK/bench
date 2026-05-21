/**
 * Localization / 本地化: own translations only; 只处理语言资源与 i18n.
 */
declare module "*.json" {
  const value: Record<string, unknown>;
  export default value;
}
