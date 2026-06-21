import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Save,
  X,
  Edit3,
  ArrowRightLeft,
} from "lucide-react";

import {
  listPricingStandards,
  createPricingStandard,
  updatePricingStandard,
  deletePricingStandard,
} from "@/features/token-calculator/api";
import type {
  ModelPricing,
  PricingStandard,
} from "@/features/token-calculator/api";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_EXCHANGE_RATE,
  RATIO_PRESETS,
  convertPrice,
  displayPrice,
  effectiveInputPrice,
  estimateTokens,
  formatCost,
  formatPrice,
  getTokenUnits,
  hasCachePricing,
  mixedPricePerMillionTokens,
  normalizeExchangeRate,
  parseNonNegativeInteger,
  parseNonNegativeNumber,
  type DisplayCurrency,
  type TranslateFn,
} from "@/features/token-calculator/model/pricing";

// ─── Empty model row ────────────────────────────────────────────────
const EMPTY_MODEL: ModelPricing = {
  modelName: "",
  inputPrice: 0,
  cachedWritePrice: null,
  cachedReadPrice: null,
  outputPrice: 0,
  currency: "USD",
};

// ─── Main Page ──────────────────────────────────────────────────────
export default function TokenCalculatorPage() {
  const { t } = useTranslation();
  const [standards, setStandards] = useState<PricingStandard[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("standards");

  // Currency display toggle
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>("USD");
  const [exchangeRate, setExchangeRate] = useState(DEFAULT_EXCHANGE_RATE);

  const loadStandards = useCallback(async () => {
    try {
      const data = await listPricingStandards();
      setStandards(data);
    } catch {
      toast.error(t("tokenCalculator.toasts.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadStandards();
  }, [loadStandards]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-muted-foreground">{t("tokenCalculator.loading")}</p>
      </div>
    );
  }

  // Currency toolbar shared across tabs
  const currencyToolbar = (
    <div className="flex items-center gap-2 select-none">
      <span className="text-xs text-muted-foreground">{t("tokenCalculator.displayCurrency")}:</span>
      <div className="flex rounded-md border border-border">
        <Button
          size="xs"
          className={`rounded-r-none border-0 ${
            displayCurrency === "USD"
              ? "bg-primary text-primary-foreground hover:bg-primary/80"
              : "bg-transparent text-muted-foreground hover:bg-muted"
          }`}
          onClick={() => setDisplayCurrency("USD")}
        >
          USD
        </Button>
        <Button
          size="xs"
          className={`rounded-l-none border-0 ${
            displayCurrency === "CNY"
              ? "bg-primary text-primary-foreground hover:bg-primary/80"
              : "bg-transparent text-muted-foreground hover:bg-muted"
          }`}
          onClick={() => setDisplayCurrency("CNY")}
        >
          CNY
        </Button>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {t("tokenCalculator.exchangeRate")}:
        </span>
        <Input
          className="h-7 w-16 text-xs"
          type="number"
          min={0.1}
          step={0.1}
          value={exchangeRate || ""}
          onChange={(e) => setExchangeRate(normalizeExchangeRate(parseFloat(e.target.value)))}
        />
      </div>
    </div>
  );

  const sharedProps = {
    displayCurrency,
    exchangeRate,
    t,
  } as const;

  return (
    <div className="flex h-full flex-col overflow-hidden p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">
          {t("tokenCalculator.title")}
        </h1>
        {currencyToolbar}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="mb-4 w-fit select-none">
          <TabsTrigger value="standards" className="select-none">
            {t("tokenCalculator.tabs.standards")}
          </TabsTrigger>
          <TabsTrigger value="compare" className="select-none">
            {t("tokenCalculator.tabs.compare")}
          </TabsTrigger>
          <TabsTrigger value="calculator" className="select-none">
            {t("tokenCalculator.tabs.calculator")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="standards" className="flex-1 overflow-auto" forceMount>
          <StandardsTab
            standards={standards}
            onRefresh={loadStandards}
            {...sharedProps}
          />
        </TabsContent>

        <TabsContent value="compare" className="flex-1 overflow-auto" forceMount>
          <CompareTab standards={standards} {...sharedProps} />
        </TabsContent>

        <TabsContent value="calculator" className="flex-1 overflow-auto" forceMount>
          <CalculatorTab standards={standards} {...sharedProps} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Standards Tab ──────────────────────────────────────────────────
function StandardsTab({
  standards,
  onRefresh,
  displayCurrency,
  exchangeRate,
  t,
}: {
  standards: PricingStandard[];
  onRefresh: () => void;
  displayCurrency: DisplayCurrency;
  exchangeRate: number;
  t: TranslateFn;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editModels, setEditModels] = useState<ModelPricing[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<PricingStandard | null>(null);

  // Create new dialog
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newModels, setNewModels] = useState<ModelPricing[]>([{ ...EMPTY_MODEL }]);

  const handleCreate = async () => {
    try {
      await createPricingStandard(newName, newModels.filter((m) => m.modelName));
      toast.success(t("tokenCalculator.toasts.created"));
      setShowCreate(false);
      setNewName("");
      setNewModels([{ ...EMPTY_MODEL }]);
      onRefresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg.includes("already exists") ? t("tokenCalculator.toasts.duplicateName") : t("tokenCalculator.toasts.createFailed"));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deletePricingStandard(deleteTarget.id);
      toast.success(t("tokenCalculator.toasts.deleted"));
      setDeleteTarget(null);
      onRefresh();
    } catch {
      toast.error(t("tokenCalculator.toasts.deleteFailed"));
    }
  };

  const startEdit = (s: PricingStandard) => {
    setEditingId(s.id);
    setEditName(s.name);
    setEditModels(s.models.map((m) => ({ ...m })));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditModels([]);
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    try {
      await updatePricingStandard(
        editingId,
        editName,
        editModels.filter((m) => m.modelName)
      );
      toast.success(t("tokenCalculator.toasts.updated"));
      cancelEdit();
      onRefresh();
    } catch {
      toast.error(t("tokenCalculator.toasts.updateFailed"));
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 flex items-center justify-between bg-background pb-3">
        <p className="text-sm text-muted-foreground">
          {t("tokenCalculator.standards.subtitle")}
        </p>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="mr-1 h-4 w-4" />
          {t("tokenCalculator.standards.add")}
        </Button>
      </div>

      <div className="space-y-4">
      {standards.map((s) => (
        <Card key={s.id} className="p-4">
          {editingId === s.id ? (
            <div className="space-y-3">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={t("tokenCalculator.standards.namePlaceholder")}
              />
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <span className="flex-1">{t("tokenCalculator.modelName")}</span>
                <span className="w-20 text-center">{t("tokenCalculator.inputPriceShort")}</span>
                <span className="w-20 text-center">{t("tokenCalculator.cacheWriteShort")}</span>
                <span className="w-20 text-center">{t("tokenCalculator.cacheReadShort")}</span>
                <span className="w-20 text-center">{t("tokenCalculator.outputPriceShort")}</span>
                <span className="w-20 text-center">{t("tokenCalculator.currencyShort")}</span>
                <span className="w-9" />
              </div>
              {editModels.map((m, i) => (
                <ModelRow
                  key={i}
                  model={m}
                  onChange={(updated) => {
                    const next = [...editModels];
                    next[i] = updated;
                    setEditModels(next);
                  }}
                  onRemove={() => setEditModels(editModels.filter((_, j) => j !== i))}
                  t={t}
                />
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditModels([...editModels, { ...EMPTY_MODEL }])}
              >
                <Plus className="mr-1 h-3 w-3" /> {t("tokenCalculator.standards.addModel")}
              </Button>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleUpdate}>
                  <Save className="mr-1 h-4 w-4" /> {t("tokenCalculator.standards.save")}
                </Button>
                <Button size="sm" variant="outline" onClick={cancelEdit}>
                  <X className="mr-1 h-4 w-4" /> {t("tokenCalculator.standards.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{s.name}</h3>
                {s.isBuiltIn && (
                  <Badge variant="secondary">
                    {t("tokenCalculator.standards.builtIn")}
                  </Badge>
                )}
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon-sm" onClick={() => startEdit(s)}>
                  <Edit3 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setDeleteTarget(s)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              </div>
              <div className="grid grid-cols-5 gap-2 text-xs font-medium text-muted-foreground">
                <span>{t("tokenCalculator.modelName")}</span>
                <span>{t("tokenCalculator.inputPrice")} / 1M tokens</span>
                <span>{t("tokenCalculator.cacheWritePrice")} / 1M tokens</span>
                <span>{t("tokenCalculator.cacheReadPrice")} / 1M tokens</span>
                <span>{t("tokenCalculator.outputPrice")} / 1M tokens</span>
              </div>
              {s.models.map((m, i) => (
                <div key={i} className="grid grid-cols-5 gap-2 py-1 text-sm">
                  <span className="font-medium">{m.modelName}</span>
                  <span>{displayPrice(m.inputPrice, m.currency, displayCurrency, exchangeRate)}</span>
                  <span className="text-muted-foreground">
                    {m.cachedWritePrice != null
                      ? displayPrice(m.cachedWritePrice, m.currency, displayCurrency, exchangeRate)
                      : "—"}
                  </span>
                  <span className="text-muted-foreground">
                    {m.cachedReadPrice != null
                      ? displayPrice(m.cachedReadPrice, m.currency, displayCurrency, exchangeRate)
                      : "—"}
                  </span>
                  <span>{displayPrice(m.outputPrice, m.currency, displayCurrency, exchangeRate)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      ))}
      </div>

      {/* Create Dialog */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <Card className="w-full max-w-2xl p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold">
              {t("tokenCalculator.standards.createTitle")}
            </h2>
            <div className="space-y-3 max-h-[60vh] overflow-auto">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("tokenCalculator.standards.namePlaceholder")}
              />
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <span className="flex-1">{t("tokenCalculator.modelName")}</span>
                <span className="w-20 text-center">{t("tokenCalculator.inputPriceShort")}</span>
                <span className="w-20 text-center">{t("tokenCalculator.cacheWriteShort")}</span>
                <span className="w-20 text-center">{t("tokenCalculator.cacheReadShort")}</span>
                <span className="w-20 text-center">{t("tokenCalculator.outputPriceShort")}</span>
                <span className="w-20 text-center">{t("tokenCalculator.currencyShort")}</span>
                <span className="w-9" />
              </div>
              {newModels.map((m, i) => (
                <ModelRow
                  key={i}
                  model={m}
                  onChange={(updated) => {
                    const next = [...newModels];
                    next[i] = updated;
                    setNewModels(next);
                  }}
                  onRemove={() => setNewModels(newModels.filter((_, j) => j !== i))}
                  t={t}
                />
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setNewModels([...newModels, { ...EMPTY_MODEL }])}
              >
                <Plus className="mr-1 h-3 w-3" /> {t("tokenCalculator.standards.addModel")}
              </Button>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>
                {t("tokenCalculator.standards.cancel")}
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!newName.trim() || newModels.every((m) => !m.modelName.trim())}
              >
                {t("tokenCalculator.standards.create")}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("tokenCalculator.standards.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("tokenCalculator.standards.deleteDesc", { name: deleteTarget?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("tokenCalculator.standards.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              {t("tokenCalculator.standards.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Model Row ──────────────────────────────────────────────────────
function ModelRow({
  model,
  onChange,
  onRemove,
  t,
}: {
  model: ModelPricing;
  onChange: (m: ModelPricing) => void;
  onRemove: () => void;
  t: (key: string) => string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Input
        className="flex-1"
        placeholder={t("tokenCalculator.modelNamePlaceholder")}
        value={model.modelName}
        onChange={(e) => onChange({ ...model, modelName: e.target.value })}
      />
      <Input
        className="w-20"
        type="number"
        min={0}
        step="any"
        placeholder={t("tokenCalculator.inputPriceShort")}
        value={model.inputPrice || ""}
        onChange={(e) =>
          onChange({ ...model, inputPrice: parseNonNegativeNumber(e.target.value) })
        }
      />
      <Input
        className="w-20"
        type="number"
        min={0}
        step="any"
        placeholder={t("tokenCalculator.cacheWriteShort")}
        value={model.cachedWritePrice ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          onChange({ ...model, cachedWritePrice: v === "" ? null : parseNonNegativeNumber(v) });
        }}
      />
      <Input
        className="w-20"
        type="number"
        min={0}
        step="any"
        placeholder={t("tokenCalculator.cacheReadShort")}
        value={model.cachedReadPrice ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          onChange({ ...model, cachedReadPrice: v === "" ? null : parseNonNegativeNumber(v) });
        }}
      />
      <Input
        className="w-20"
        type="number"
        min={0}
        step="any"
        placeholder={t("tokenCalculator.outputPriceShort")}
        value={model.outputPrice || ""}
        onChange={(e) =>
          onChange({ ...model, outputPrice: parseNonNegativeNumber(e.target.value) })
        }
      />
      <Select
        value={model.currency}
        onValueChange={(v) => onChange({ ...model, currency: v })}
      >
        <SelectTrigger className="w-20">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="USD">USD</SelectItem>
          <SelectItem value="CNY">CNY</SelectItem>
        </SelectContent>
      </Select>
      <Button variant="ghost" size="icon-sm" onClick={onRemove}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ─── Compare Tab ────────────────────────────────────────────────────

type SelectedModel = {
  standardId: string;
  standardName: string;
  model: ModelPricing;
};

type CompareMode = "workload" | "budget";

function CompareTab({
  standards,
  displayCurrency,
  exchangeRate,
  t,
}: {
  standards: PricingStandard[];
  displayCurrency: DisplayCurrency;
  exchangeRate: number;
  t: TranslateFn;
}) {
  const tokenUnits = useMemo(() => getTokenUnits(t), [t]);
  const [mode, setMode] = useState<CompareMode>("workload");
  const [selectedModels, setSelectedModels] = useState<SelectedModel[]>([]);

  // Selection state
  const [selStandardId, setSelStandardId] = useState("");
  const [selModelName, setSelModelName] = useState("");

  // Workload inputs
  const [inputTokens, setInputTokens] = useState(1);
  const [inputUnit, setInputUnit] = useState("million");
  const [outputTokens, setOutputTokens] = useState(1);
  const [outputUnit, setOutputUnit] = useState("million");
  const [ratio, setRatio] = useState(1); // input:output ratio, default 1:1

  // When ratio changes, redistribute total tokens keeping units
  const handleRatioChange = (newRatio: number) => {
    setRatio(newRatio);
    const total = actualInputTokens + actualOutputTokens;
    if (total <= 0) return;
    const newInputActual = Math.round(total * newRatio / (newRatio + 1));
    const newOutputActual = total - newInputActual;
    setInputTokens(Number((newInputActual / inputMultiplier).toFixed(4)));
    setOutputTokens(Number((newOutputActual / outputMultiplier).toFixed(4)));
  };

  // Budget input
  const [budget, setBudget] = useState(100);

  const inputMultiplier = tokenUnits.find((u) => u.value === inputUnit)?.multiplier ?? 1;
  const outputMultiplier = tokenUnits.find((u) => u.value === outputUnit)?.multiplier ?? 1;
  const actualInputTokens = (inputTokens || 0) * inputMultiplier;
  const actualOutputTokens = (outputTokens || 0) * outputMultiplier;
  const ratioPresetIndex = RATIO_PRESETS.findIndex((r) => r >= ratio);
  const selectedRatioPresetIndex =
    ratioPresetIndex === -1 ? RATIO_PRESETS.length - 1 : ratioPresetIndex;

  const currentStandard = standards.find((s) => s.id === selStandardId) ?? null;

  const addModel = () => {
    if (!currentStandard || !selModelName) return;
    const m = currentStandard.models.find((x) => x.modelName === selModelName);
    if (!m) return;
    const alreadyAdded = selectedModels.some(
      (sm) => sm.standardId === currentStandard.id && sm.model.modelName === m.modelName
    );
    if (alreadyAdded) return;
    setSelectedModels([
      ...selectedModels,
      { standardId: currentStandard.id, standardName: currentStandard.name, model: m },
    ]);
    setSelModelName("");
  };

  const removeModel = (idx: number) => {
    const removed = selectedModels[idx];
    setSelectedModels(selectedModels.filter((_, i) => i !== idx));
    // Clean up cache hit rate for removed model
    if (removed) {
      const key = `${removed.standardId}::${removed.model.modelName}`;
      setCacheHitRates((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  // ── Cache hit rates (per model) ─────────────────────────────────
  const [cacheHitRates, setCacheHitRates] = useState<Record<string, number>>({});
  const getHitRate = (standardId: string, modelName: string): number =>
    cacheHitRates[`${standardId}::${modelName}`] ?? 90;
  const setHitRate = (standardId: string, modelName: string, rate: number) => {
    setCacheHitRates((prev) => ({
      ...prev,
      [`${standardId}::${modelName}`]: Math.min(100, Math.max(0, rate || 0)),
    }));
  };

  // ── Workload results ─────────────────────────────────────────────
  const workloadResults = useMemo(() => {
    return selectedModels
      .map((sm) => {
        const src = sm.model.currency;
        const inp = convertPrice(sm.model.inputPrice, src, displayCurrency, exchangeRate);
        const cacheWrite = sm.model.cachedWritePrice != null ? convertPrice(sm.model.cachedWritePrice, src, displayCurrency, exchangeRate) : null;
        const cacheRead = sm.model.cachedReadPrice != null ? convertPrice(sm.model.cachedReadPrice, src, displayCurrency, exchangeRate) : null;
        const outp = convertPrice(sm.model.outputPrice, src, displayCurrency, exchangeRate);
        const hitRate = getHitRate(sm.standardId, sm.model.modelName);
        const effInp = effectiveInputPrice(inp, cacheWrite, cacheRead, hitRate);
        const cost = (actualInputTokens / 1_000_000) * effInp + (actualOutputTokens / 1_000_000) * outp;

        // Also compute in the other currency
        const inpUsd = convertPrice(sm.model.inputPrice, src, "USD", exchangeRate);
        const cwUsd = sm.model.cachedWritePrice != null ? convertPrice(sm.model.cachedWritePrice, src, "USD", exchangeRate) : null;
        const crUsd = sm.model.cachedReadPrice != null ? convertPrice(sm.model.cachedReadPrice, src, "USD", exchangeRate) : null;
        const outpUsd = convertPrice(sm.model.outputPrice, src, "USD", exchangeRate);
        const effUsd = effectiveInputPrice(inpUsd, cwUsd, crUsd, hitRate);
        const costUsd = (actualInputTokens / 1_000_000) * effUsd + (actualOutputTokens / 1_000_000) * outpUsd;

        const inpCny = convertPrice(sm.model.inputPrice, src, "CNY", exchangeRate);
        const cwCny = sm.model.cachedWritePrice != null ? convertPrice(sm.model.cachedWritePrice, src, "CNY", exchangeRate) : null;
        const crCny = sm.model.cachedReadPrice != null ? convertPrice(sm.model.cachedReadPrice, src, "CNY", exchangeRate) : null;
        const outpCny = convertPrice(sm.model.outputPrice, src, "CNY", exchangeRate);
        const effCny = effectiveInputPrice(inpCny, cwCny, crCny, hitRate);
        const costCny = (actualInputTokens / 1_000_000) * effCny + (actualOutputTokens / 1_000_000) * outpCny;

        return { ...sm, inputPriceConv: inp, cacheWritePriceConv: cacheWrite, cacheReadPriceConv: cacheRead, outputPriceConv: outp, hitRate, cost, costUsd, costCny };
      })
      .sort((a, b) => a.cost - b.cost);
  }, [selectedModels, actualInputTokens, actualOutputTokens, displayCurrency, exchangeRate, cacheHitRates]);

  // ── Budget results ───────────────────────────────────────────────
  const budgetResults = useMemo(() => {
    return selectedModels
      .map((sm) => {
        const inp = convertPrice(sm.model.inputPrice, sm.model.currency, displayCurrency, exchangeRate);
        const cacheWrite = sm.model.cachedWritePrice != null
          ? convertPrice(sm.model.cachedWritePrice, sm.model.currency, displayCurrency, exchangeRate)
          : null;
        const cacheRead = sm.model.cachedReadPrice != null
          ? convertPrice(sm.model.cachedReadPrice, sm.model.currency, displayCurrency, exchangeRate)
          : null;
        const outp = convertPrice(sm.model.outputPrice, sm.model.currency, displayCurrency, exchangeRate);
        const hitRate = getHitRate(sm.standardId, sm.model.modelName);
        const effInp = effectiveInputPrice(inp, cacheWrite, cacheRead, hitRate);
        const maxInput = effInp > 0 ? Math.floor(budget / effInp * 1_000_000) : Number.MAX_SAFE_INTEGER;
        const maxOutput = outp > 0 ? Math.floor(budget / outp * 1_000_000) : Number.MAX_SAFE_INTEGER;
        const mixedPrice = mixedPricePerMillionTokens(effInp, outp, ratio);
        const maxMixed = mixedPrice > 0 ? Math.floor(budget / mixedPrice * 1_000_000) : Number.MAX_SAFE_INTEGER;
        return { ...sm, inputPriceConv: inp, cacheWritePriceConv: cacheWrite, cacheReadPriceConv: cacheRead, outputPriceConv: outp, hitRate, maxInput, maxOutput, maxMixed };
      })
      .sort((a, b) => b.maxMixed - a.maxMixed);
  }, [selectedModels, budget, ratio, displayCurrency, exchangeRate, cacheHitRates]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t("tokenCalculator.compare.subtitle")}
      </p>

      {/* ── Model selector ─────────────────────────────────── */}
      <Card className="p-4 space-y-3">
        <p className="text-xs font-medium text-muted-foreground">
          {t("tokenCalculator.compare.selectModels")}
        </p>
        <div className="flex gap-2">
          <Select value={selStandardId} onValueChange={(v) => { setSelStandardId(v); setSelModelName(""); }}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t("tokenCalculator.compare.selectStandard")} />
            </SelectTrigger>
            <SelectContent>
              {standards.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={selModelName}
            onValueChange={setSelModelName}
            disabled={!currentStandard}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t("tokenCalculator.compare.selectModel")} />
            </SelectTrigger>
            <SelectContent>
              {currentStandard?.models.map((m, i) => (
                <SelectItem key={i} value={m.modelName}>{m.modelName}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            size="sm"
            variant="secondary"
            disabled={!currentStandard || !selModelName}
            onClick={addModel}
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("tokenCalculator.compare.addModel")}
          </Button>
        </div>

        {/* Selected model chips */}
        {selectedModels.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedModels.map((sm, i) => (
              <Badge key={i} variant="secondary" className="gap-1 pr-1 select-none">
                <span className="text-muted-foreground text-[10px]">{sm.standardName}</span>
                <span className="font-medium">{sm.model.modelName}</span>
                <button
                  className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
                  onClick={() => removeModel(i)}
                  aria-label={t("tokenCalculator.compare.removeModel")}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </Card>

      {/* ── Mode toggle ────────────────────────────────────── */}
      <div className="flex items-center gap-2 select-none">
        <span className="text-xs text-muted-foreground">
          {t("tokenCalculator.compare.mode")}:
        </span>
        <div className="flex rounded-md border border-border">
          <Button
            size="xs"
            className={`rounded-r-none border-0 ${
              mode === "workload"
                ? "bg-primary text-primary-foreground hover:bg-primary/80"
                : "bg-transparent text-muted-foreground hover:bg-muted"
            }`}
            onClick={() => setMode("workload")}
          >
            {t("tokenCalculator.compare.modeWorkload")}
          </Button>
          <Button
            size="xs"
            className={`rounded-l-none border-0 ${
              mode === "budget"
                ? "bg-primary text-primary-foreground hover:bg-primary/80"
                : "bg-transparent text-muted-foreground hover:bg-muted"
            }`}
            onClick={() => setMode("budget")}
          >
            {t("tokenCalculator.compare.modeBudget")}
          </Button>
        </div>
      </div>

      {/* ── Workload inputs ────────────────────────────────── */}
      {mode === "workload" && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              {t("tokenCalculator.compare.inputTokens")}
            </label>
            <div className="flex gap-1">
              <Input
                className="w-28"
                type="number"
                min={0}
                step="any"
                value={inputTokens || ""}
                onChange={(e) => setInputTokens(parseNonNegativeNumber(e.target.value))}
              />
              <Select value={inputUnit} onValueChange={setInputUnit}>
                <SelectTrigger className="w-[72px] h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tokenUnits.map((u) => (
                    <SelectItem key={u.value} value={u.value}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              {t("tokenCalculator.compare.outputTokens")}
            </label>
            <div className="flex gap-1">
              <Input
                className="w-28"
                type="number"
                min={0}
                step="any"
                value={outputTokens || ""}
                onChange={(e) => setOutputTokens(parseNonNegativeNumber(e.target.value))}
              />
              <Select value={outputUnit} onValueChange={setOutputUnit}>
                <SelectTrigger className="w-[72px] h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tokenUnits.map((u) => (
                    <SelectItem key={u.value} value={u.value}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground pb-2">
            {t("tokenCalculator.compare.totalTokens", {
              total: (actualInputTokens + actualOutputTokens).toLocaleString(),
            })}
          </p>
          {/* Ratio slider */}
          <div className="flex items-center gap-3 select-none">
            <label className="text-xs text-muted-foreground whitespace-nowrap">
              {t("tokenCalculator.compare.ratioLabel")}:
            </label>
            <input
              type="range"
              min={0}
              max={7}
              step={1}
              value={selectedRatioPresetIndex}
              onChange={(e) => {
                const idx = parseNonNegativeInteger(e.target.value);
                handleRatioChange(RATIO_PRESETS[idx] ?? 1);
              }}
              className="flex-1 h-1.5 appearance-none bg-muted rounded-full accent-primary cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-sm"
            />
            <span className="text-xs font-medium text-foreground min-w-[50px] text-right">
              {ratio} : 1
            </span>
          </div>
          <div className="w-full rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground leading-relaxed space-y-1">
            <p>
              <strong>{t("tokenCalculator.compare.formulaInputTokens")}</strong> = {t("tokenCalculator.compare.formulaTotal")} × {ratio} / ({ratio} + 1) &nbsp;|&nbsp; <strong>{t("tokenCalculator.compare.formulaOutputTokens")}</strong> = {t("tokenCalculator.compare.formulaTotal")} × 1 / ({ratio} + 1)
            </p>
            <p>
              {t("tokenCalculator.compare.formulaCost")} = (<strong>{t("tokenCalculator.compare.formulaInputTokens")}</strong> / 1M) × <strong>{t("tokenCalculator.compare.formulaEffInput")}</strong> + (<strong>{t("tokenCalculator.compare.formulaOutputTokens")}</strong> / 1M) × <strong>{t("tokenCalculator.compare.formulaOutputPrice")}</strong>
            </p>
            <p>
              {t("tokenCalculator.compare.formulaEffInput")} = ((100 − {t("tokenCalculator.compare.cacheHitRate")}%) × <strong>{t("tokenCalculator.compare.cacheWritePriceCol")}</strong> + {t("tokenCalculator.compare.cacheHitRate")}% × <strong>{t("tokenCalculator.compare.cacheReadPriceCol")}</strong>) / 100
            </p>
          </div>
        </div>
      )}

      {/* ── Budget input ───────────────────────────────────── */}
      {mode === "budget" && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              {t("tokenCalculator.compare.budgetAmount")}
            </label>
            <Input
              className="w-40"
              type="number"
              min={0}
              step="any"
              value={budget || ""}
              onChange={(e) => setBudget(parseNonNegativeNumber(e.target.value))}
            />
          </div>
          <p className="text-xs text-muted-foreground pb-2">
            {displayCurrency}
          </p>
          <div className="flex min-w-[220px] items-center gap-3 pb-2 select-none">
            <label className="text-xs text-muted-foreground whitespace-nowrap">
              {t("tokenCalculator.compare.ratioLabel")}:
            </label>
            <input
              type="range"
              min={0}
              max={7}
              step={1}
              value={selectedRatioPresetIndex}
              onChange={(e) => {
                const idx = parseNonNegativeInteger(e.target.value);
                setRatio(RATIO_PRESETS[idx] ?? 1);
              }}
              className="h-1.5 flex-1 appearance-none rounded-full bg-muted accent-primary cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-sm"
            />
            <span className="min-w-[50px] text-right text-xs font-medium text-foreground">
              {ratio} : 1
            </span>
          </div>
          <div className="w-full rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground leading-relaxed">
            <p>
              <strong>{t("tokenCalculator.compare.maxInputTokens")}</strong> = {t("tokenCalculator.compare.budgetAmount")} / <strong>{t("tokenCalculator.compare.formulaEffInput")}</strong> × 1M
            </p>
            <p>
              <strong>{t("tokenCalculator.compare.maxOutputTokens")}</strong> = {t("tokenCalculator.compare.budgetAmount")} / <strong>{t("tokenCalculator.compare.formulaOutputPrice")}</strong> × 1M
            </p>
            <p>
              <strong>{t("tokenCalculator.compare.maxMixedTokens")}</strong> = {t("tokenCalculator.compare.budgetAmount")} / ((<strong>{t("tokenCalculator.compare.formulaEffInput")}</strong> × {ratio} + <strong>{t("tokenCalculator.compare.formulaOutputPrice")}</strong>) / ({ratio} + 1)) × 1M
            </p>
            <p className="mt-0.5 text-[10px] opacity-60">
              {t("tokenCalculator.compare.formulaEffInput")} = ((100 − {t("tokenCalculator.compare.cacheHitRate")}%) × {t("tokenCalculator.compare.cacheWritePriceCol")} + {t("tokenCalculator.compare.cacheHitRate")}% × {t("tokenCalculator.compare.cacheReadPriceCol")}) / 100
            </p>
          </div>
        </div>
      )}

      {/* ── Results table ──────────────────────────────────── */}
      {selectedModels.length > 0 && mode === "workload" && (
        <Card className="overflow-auto p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="pb-2 text-left">{t("tokenCalculator.modelName")}</th>
                <th className="pb-2 text-center">{t("tokenCalculator.compare.cacheHitRate")}</th>
                <th className="pb-2 text-right">{t("tokenCalculator.compare.inputPriceCol")}</th>
                <th className="pb-2 text-right">{t("tokenCalculator.compare.cacheWritePriceCol")}</th>
                <th className="pb-2 text-right">{t("tokenCalculator.compare.cacheReadPriceCol")}</th>
                <th className="pb-2 text-right">{t("tokenCalculator.compare.outputPriceCol")}</th>
                <th className="pb-2 text-right">{t("tokenCalculator.compare.totalCost")} (USD / CNY)</th>
              </tr>
            </thead>
            <tbody>
              {workloadResults.map((r, i) => {
                const cheapest = workloadResults[0]?.costUsd ?? 0;
                const costRatio = cheapest > 0 ? r.costUsd / cheapest : 1;
                const hasCache = hasCachePricing(r.model);
                return (
                  <tr key={i} className="border-b border-muted last:border-0">
                    <td className="py-2">
                      <span className="font-medium">{r.model.modelName}</span>
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {r.standardName}
                      </span>
                    </td>
                    <td className="py-2 text-center">
                      {hasCache ? (
                        <div className="inline-flex items-center gap-0.5">
                          <Input
                            className="w-14 h-7 text-xs text-center px-1"
                            type="number"
                            min={0}
                            max={100}
                            step={5}
                            value={r.hitRate || ""}
                            onChange={(e) =>
                              setHitRate(r.standardId, r.model.modelName, parseNonNegativeInteger(e.target.value))
                            }
                          />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 text-right text-muted-foreground">
                      {formatPrice(r.inputPriceConv, displayCurrency)}
                    </td>
                    <td className="py-2 text-right text-muted-foreground">
                      {r.cacheWritePriceConv != null
                        ? formatPrice(r.cacheWritePriceConv, displayCurrency)
                        : "—"}
                    </td>
                    <td className="py-2 text-right text-muted-foreground">
                      {r.cacheReadPriceConv != null
                        ? formatPrice(r.cacheReadPriceConv, displayCurrency)
                        : "—"}
                    </td>
                    <td className="py-2 text-right text-muted-foreground">
                      {formatPrice(r.outputPriceConv, displayCurrency)}
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-xs text-muted-foreground">
                          {formatCost(r.costUsd, "USD")}
                        </span>
                        <span
                          className={
                            i === 0
                              ? "font-semibold text-green-500 text-xs"
                              : costRatio >= 10
                                ? "text-red-500 text-xs"
                                : "text-xs"
                          }
                        >
                          {formatCost(r.costCny, "CNY")}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {selectedModels.length > 0 && mode === "budget" && (
        <Card className="overflow-auto p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="pb-2 text-left">{t("tokenCalculator.modelName")}</th>
                <th className="pb-2 text-center">{t("tokenCalculator.compare.cacheHitRate")}</th>
                <th className="pb-2 text-right">{t("tokenCalculator.compare.inputPriceCol")}</th>
                <th className="pb-2 text-right">{t("tokenCalculator.compare.cacheWritePriceCol")}</th>
                <th className="pb-2 text-right">{t("tokenCalculator.compare.cacheReadPriceCol")}</th>
                <th className="pb-2 text-right">{t("tokenCalculator.compare.outputPriceCol")}</th>
                <th className="pb-2 text-right">{t("tokenCalculator.compare.maxInputTokens")}</th>
                <th className="pb-2 text-right">{t("tokenCalculator.compare.maxOutputTokens")}</th>
                <th className="pb-2 text-right">{t("tokenCalculator.compare.maxMixedTokens")}</th>
              </tr>
            </thead>
            <tbody>
              {budgetResults.map((r, i) => {
                const hasCache = hasCachePricing(r.model);
                return (
                <tr key={i} className="border-b border-muted last:border-0">
                  <td className="py-2">
                    <span className="font-medium">{r.model.modelName}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {r.standardName}
                    </span>
                  </td>
                  <td className="py-2 text-center">
                    {hasCache ? (
                      <div className="inline-flex items-center gap-0.5">
                        <Input
                          className="w-14 h-7 text-xs text-center px-1"
                          type="number"
                          min={0}
                          max={100}
                          step={5}
                          value={r.hitRate || ""}
                          onChange={(e) =>
                            setHitRate(r.standardId, r.model.modelName, parseNonNegativeInteger(e.target.value))
                          }
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-2 text-right text-muted-foreground">
                    {formatPrice(r.inputPriceConv, displayCurrency)}
                  </td>
                  <td className="py-2 text-right text-muted-foreground">
                    {r.cacheWritePriceConv != null
                      ? formatPrice(r.cacheWritePriceConv, displayCurrency)
                      : "—"}
                  </td>
                  <td className="py-2 text-right text-muted-foreground">
                    {r.cacheReadPriceConv != null
                      ? formatPrice(r.cacheReadPriceConv, displayCurrency)
                      : "—"}
                  </td>
                  <td className="py-2 text-right text-muted-foreground">
                    {formatPrice(r.outputPriceConv, displayCurrency)}
                  </td>
                  <td className="py-2 text-right">
                    {r.maxInput === Number.MAX_SAFE_INTEGER
                      ? "∞"
                      : r.maxInput.toLocaleString()}
                  </td>
                  <td className="py-2 text-right">
                    {r.maxOutput === Number.MAX_SAFE_INTEGER
                      ? "∞"
                      : r.maxOutput.toLocaleString()}
                  </td>
                  <td className="py-2 text-right font-semibold">
                    {r.maxMixed === Number.MAX_SAFE_INTEGER
                      ? "∞"
                      : r.maxMixed.toLocaleString()}
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </Card>
      )}

      {/* ── Empty state ────────────────────────────────────── */}
      {selectedModels.length === 0 && (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <ArrowRightLeft className="mr-2 h-5 w-5" />
          {t("tokenCalculator.compare.selectHint")}
        </div>
      )}
    </div>
  );
}

// ─── Calculator Tab ─────────────────────────────────────────────────
function CalculatorTab({
  standards,
  displayCurrency,
  exchangeRate,
  t,
}: {
  standards: PricingStandard[];
  displayCurrency: DisplayCurrency;
  exchangeRate: number;
  t: TranslateFn;
}) {
  const [text, setText] = useState("");
  const [selectedStandardId, setSelectedStandardId] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [cacheHitRate, setCacheHitRate] = useState(90);

  const tokenCount = estimateTokens(text);
  const standard = standards.find((s) => s.id === selectedStandardId) ?? null;
  const modelPricing = standard?.models.find((m) => m.modelName === selectedModel) ?? null;

  const inputPrice = modelPricing
    ? convertPrice(modelPricing.inputPrice, modelPricing.currency, displayCurrency, exchangeRate)
    : 0;
  const outputPrice = modelPricing
    ? convertPrice(modelPricing.outputPrice, modelPricing.currency, displayCurrency, exchangeRate)
    : 0;
  const cachedWritePrice = modelPricing?.cachedWritePrice != null
    ? convertPrice(modelPricing.cachedWritePrice, modelPricing.currency, displayCurrency, exchangeRate)
    : null;
  const cachedReadPrice = modelPricing?.cachedReadPrice != null
    ? convertPrice(modelPricing.cachedReadPrice, modelPricing.currency, displayCurrency, exchangeRate)
    : null;
  const usesCachePricing = modelPricing ? hasCachePricing(modelPricing) : false;
  const effectiveCalculatorInputPrice = modelPricing
    ? effectiveInputPrice(
        inputPrice,
        cachedWritePrice,
        cachedReadPrice,
        usesCachePricing ? cacheHitRate : 0
      )
    : 0;
  const inputCost = (tokenCount / 1_000_000) * effectiveCalculatorInputPrice;
  const outputCost = (tokenCount / 1_000_000) * outputPrice;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t("tokenCalculator.calculator.subtitle")}
      </p>

      <Textarea
        className="min-h-[160px]"
        placeholder={t("tokenCalculator.calculator.textPlaceholder")}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <div className="grid grid-cols-2 gap-4">
        <Select value={selectedStandardId} onValueChange={(v) => { setSelectedStandardId(v); setSelectedModel(""); }}>
          <SelectTrigger>
            <SelectValue placeholder={t("tokenCalculator.calculator.selectStandard")} />
          </SelectTrigger>
          <SelectContent>
            {standards.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={selectedModel}
          onValueChange={setSelectedModel}
          disabled={!standard}
        >
          <SelectTrigger>
            <SelectValue placeholder={t("tokenCalculator.calculator.selectModel")} />
          </SelectTrigger>
          <SelectContent>
            {standard?.models.map((m, i) => (
              <SelectItem key={i} value={m.modelName}>
                {m.modelName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {modelPricing && usesCachePricing && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">
            {t("tokenCalculator.compare.cacheHitRate")}:
          </label>
          <Input
            className="h-8 w-20 text-xs"
            type="number"
            min={0}
            max={100}
            step={5}
            value={cacheHitRate || ""}
            onChange={(e) =>
              setCacheHitRate(Math.min(100, parseNonNegativeInteger(e.target.value)))
            }
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
      )}

      {text && (
        <Card className="p-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">
                {t("tokenCalculator.calculator.estimatedTokens")}
              </p>
              <p className="text-2xl font-bold">{tokenCount.toLocaleString()}</p>
            </div>
            {modelPricing && (
              <>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t("tokenCalculator.calculator.inputCost")}
                  </p>
                  <p className="text-xl font-semibold">
                    {formatCost(inputCost, displayCurrency)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t("tokenCalculator.calculator.outputCost")}
                  </p>
                  <p className="text-xl font-semibold">
                    {formatCost(outputCost, displayCurrency)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t("tokenCalculator.calculator.totalCost")}
                  </p>
                  <p className="text-xl font-semibold text-primary">
                    {formatCost(inputCost + outputCost, displayCurrency)}
                  </p>
                </div>
              </>
            )}
          </div>
          {modelPricing && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("tokenCalculator.calculator.pricingInfo", {
                model: modelPricing.modelName,
                inputPrice: formatPrice(effectiveCalculatorInputPrice, displayCurrency),
                outputPrice: formatPrice(outputPrice, displayCurrency),
              })}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
