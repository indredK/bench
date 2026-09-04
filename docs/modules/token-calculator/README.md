# Token Calculator（Token 计算器）

> **完备功能规格** → [product-specs/token-calculator.md](../../product-specs/token-calculator.md)
> **规划功能** → [planned/token-calculator.md](../../planned/token-calculator.md)

代码：`src/features/token-calculator/` · `src-tauri/src/token_calculator/`

定位：估算文本 token 数、按官方/自建定价标准计算成本、多模型成本/预算对比；CJK-aware 估算、缓存/命中率定价、USD/CNY 汇率换算，内置定价 + 可自定义标准。Web/桌面均可使用。
