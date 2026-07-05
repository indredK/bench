import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Plus, Trash2, Save, X, Edit3 } from "lucide-react"
import { useGuardedAsync } from "@/hooks/useGuardedAsync"
import {
  createPricingStandard,
  updatePricingStandard,
  deletePricingStandard,
} from "@/features/token-calculator/services/token-calculator.repository"
import type {
  ModelPricing,
  PricingStandard,
} from "@/features/token-calculator/services/token-calculator.repository"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  displayPrice,
  parseNonNegativeNumber,
  type DisplayCurrency,
} from "@/features/token-calculator/model/pricing"

const EMPTY_MODEL: ModelPricing = {
  modelName: "",
  inputPrice: 0,
  cachedWritePrice: null,
  cachedReadPrice: null,
  outputPrice: 0,
  currency: "USD",
}

function ModelRow({
  model,
  onChange,
  onRemove,
}: {
  model: ModelPricing
  onChange: (m: ModelPricing) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
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
        onChange={(e) => onChange({ ...model, inputPrice: parseNonNegativeNumber(e.target.value) })}
      />
      <Input
        className="w-20"
        type="number"
        min={0}
        step="any"
        placeholder={t("tokenCalculator.cacheWriteShort")}
        value={model.cachedWritePrice ?? ""}
        onChange={(e) => {
          const v = e.target.value
          onChange({ ...model, cachedWritePrice: v === "" ? null : parseNonNegativeNumber(v) })
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
          const v = e.target.value
          onChange({ ...model, cachedReadPrice: v === "" ? null : parseNonNegativeNumber(v) })
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
      <Select value={model.currency} onValueChange={(v) => onChange({ ...model, currency: v })}>
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
  )
}

export function StandardsTab({
  standards,
  onRefresh,
  displayCurrency,
  exchangeRate,
}: {
  standards: PricingStandard[]
  onRefresh: () => void
  displayCurrency: DisplayCurrency
  exchangeRate: number
}) {
  const { t } = useTranslation()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editModels, setEditModels] = useState<ModelPricing[]>([])
  const [deleteTarget, setDeleteTarget] = useState<PricingStandard | null>(null)

  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState("")
  const [newModels, setNewModels] = useState<ModelPricing[]>([{ ...EMPTY_MODEL }])
  const { pending: mutating, run: runMutation } = useGuardedAsync()

  const handleCreate = () =>
    runMutation(async () => {
      try {
        await createPricingStandard(
          newName,
          newModels.filter((m) => m.modelName),
        )
        toast.success(t("tokenCalculator.toasts.created"))
        setShowCreate(false)
        setNewName("")
        setNewModels([{ ...EMPTY_MODEL }])
        onRefresh()
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        toast.error(
          msg.includes("already exists")
            ? t("tokenCalculator.toasts.duplicateName")
            : t("tokenCalculator.toasts.createFailed"),
        )
      }
    })

  const handleDelete = () =>
    runMutation(async () => {
      if (!deleteTarget) return
      try {
        await deletePricingStandard(deleteTarget.id)
        toast.success(t("tokenCalculator.toasts.deleted"))
        setDeleteTarget(null)
        onRefresh()
      } catch {
        toast.error(t("tokenCalculator.toasts.deleteFailed"))
      }
    })

  const startEdit = (s: PricingStandard) => {
    setEditingId(s.id)
    setEditName(s.name)
    setEditModels(s.models.map((m) => ({ ...m })))
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditName("")
    setEditModels([])
  }

  const handleUpdate = () =>
    runMutation(async () => {
      if (!editingId) return
      try {
        await updatePricingStandard(
          editingId,
          editName,
          editModels.filter((m) => m.modelName),
        )
        toast.success(t("tokenCalculator.toasts.updated"))
        cancelEdit()
        onRefresh()
      } catch {
        toast.error(t("tokenCalculator.toasts.updateFailed"))
      }
    })

  return (
    <div className="flex h-full flex-col">
      <div className="bg-background sticky top-0 z-10 flex items-center justify-between pb-3">
        <p className="text-muted-foreground text-sm">{t("tokenCalculator.standards.subtitle")}</p>
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
                <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
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
                      const next = [...editModels]
                      next[i] = updated
                      setEditModels(next)
                    }}
                    onRemove={() => setEditModels(editModels.filter((_, j) => j !== i))}
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
                  <Button size="sm" onClick={handleUpdate} disabled={mutating}>
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
                      <Badge variant="secondary">{t("tokenCalculator.standards.builtIn")}</Badge>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => startEdit(s)}>
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => setDeleteTarget(s)}>
                      <Trash2 className="text-destructive h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="text-muted-foreground grid grid-cols-5 gap-2 text-xs font-medium">
                  <span>{t("tokenCalculator.modelName")}</span>
                  <span>{t("tokenCalculator.inputPrice")} / 1M tokens</span>
                  <span>{t("tokenCalculator.cacheWritePrice")} / 1M tokens</span>
                  <span>{t("tokenCalculator.cacheReadPrice")} / 1M tokens</span>
                  <span>{t("tokenCalculator.outputPrice")} / 1M tokens</span>
                </div>
                {s.models.map((m, i) => (
                  <div key={i} className="grid grid-cols-5 gap-2 py-1 text-sm">
                    <span className="font-medium">{m.modelName}</span>
                    <span>
                      {displayPrice(m.inputPrice, m.currency, displayCurrency, exchangeRate)}
                    </span>
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
                    <span>
                      {displayPrice(m.outputPrice, m.currency, displayCurrency, exchangeRate)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <Card className="w-full max-w-2xl p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold">
              {t("tokenCalculator.standards.createTitle")}
            </h2>
            <div className="max-h-[60vh] space-y-3 overflow-auto">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("tokenCalculator.standards.namePlaceholder")}
              />
              <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
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
                    const next = [...newModels]
                    next[i] = updated
                    setNewModels(next)
                  }}
                  onRemove={() => setNewModels(newModels.filter((_, j) => j !== i))}
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
                disabled={
                  mutating || !newName.trim() || newModels.every((m) => !m.modelName.trim())
                }
              >
                {t("tokenCalculator.standards.create")}
              </Button>
            </div>
          </Card>
        </div>
      )}

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
            <AlertDialogAction
              onClick={handleDelete}
              disabled={mutating}
              className="bg-destructive text-destructive-foreground"
            >
              {t("tokenCalculator.standards.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
