/**
 * Dialogs / 对话框: station + account CRUD, delete confirm, quick login, proxy paste.
 */
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Eye, EyeOff, Globe, KeyRound, Link2, StickyNote, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import * as api from "@/features/account-manager/api";
import type { ProbeStrategy, RelayStation, StationAccount } from "@/features/account-manager/api";
import type { SessionSettings } from "@/features/account-manager/model/types";
import { CopyIconButton, Field, IconButton } from "@/features/account-manager/components/shared";

export function StationDialog({
  open,
  station,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  station: RelayStation | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    remark: string,
    website: string,
    sessionSettings?: SessionSettings
  ) => void | Promise<void | boolean>;
}) {
  const { t } = useTranslation();
  const isEditing = !!station;
  const [remark, setRemark] = useState("");
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Session Manager: 编辑模式下的高级设置
  const [probeStrategy, setProbeStrategyLocal] = useState<ProbeStrategy>("httpFirst");
  const [probeOverride, setProbeOverride] = useState(false);
  const [sessionTtlHours, setSessionTtlHours] = useState<number>(720);

  const reset = () => {
    setRemark("");
    setWebsite("");
    setProbeStrategyLocal("httpFirst");
    setProbeOverride(false);
    setSessionTtlHours(720);
  };

  useEffect(() => {
    if (open && station) {
      setRemark(station.remark);
      setWebsite(station.website);
      setSessionTtlHours(station.sessionTtlHours ?? 720);
      if (station.authProfile) {
        setProbeStrategyLocal(station.authProfile.probeStrategy);
      }
    } else if (open) {
      reset();
    }
    setSubmitting(false);
  }, [open, station]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const r = remark.trim();
    const w = website.trim();
    if (!r || !w) return;
    setSubmitting(true);
    try {
      await Promise.resolve(onSubmit(r, w, {
        probeOverride,
        probeStrategy,
        sessionTtlHours,
      }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onOpenChange(false);
      }}
    >
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t("accountManager.editStationDialog.title") : t("accountManager.addStationDialog.title")}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? t("accountManager.editStationDialog.subtitle") : t("accountManager.addStationDialog.subtitle")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("accountManager.addStationDialog.sectionBasic")}
            </h3>
            <Field
              label={t("accountManager.fields.remark")}
              icon={<StickyNote size={14} />}
              input={
                <Input
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder={t("accountManager.addStationDialog.remarkPlaceholder")}
                  required
                />
              }
            />
            <Field
              label={t("accountManager.fields.website")}
              icon={<Globe size={14} />}
              input={
                <Input
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder={t("accountManager.addStationDialog.websitePlaceholder")}
                  type="url"
                  required
                />
              }
            />
          </div>

          <section className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("accountManager.sessionManager.advancedSection.title")}
            </h3>
            <Field
              label={t("accountManager.sessionManager.advancedSection.probeStrategy")}
              input={
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={probeOverride}
                      onChange={(e) => setProbeOverride(e.target.checked)}
                    />
                    {t("accountManager.sessionManager.advancedSection.probeOverrideLabel")}
                  </label>
                  <Select
                    value={probeStrategy}
                    onValueChange={(v) => setProbeStrategyLocal(v as ProbeStrategy)}
                    disabled={!probeOverride}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="httpFirst">{t("accountManager.sessionManager.advancedSection.probeHttpFirst")}</SelectItem>
                      <SelectItem value="httpOnly">{t("accountManager.sessionManager.advancedSection.probeHttpOnly")}</SelectItem>
                      <SelectItem value="webviewOnly">{t("accountManager.sessionManager.advancedSection.probeWebviewOnly")}</SelectItem>
                      <SelectItem value="hybrid">{t("accountManager.sessionManager.advancedSection.probeHybrid")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              }
            />
            <Field
              label={t("accountManager.sessionManager.advancedSection.sessionTtlLabel")}
              input={
                <Input
                  type="number"
                  min={0}
                  value={sessionTtlHours}
                  onChange={(e) => setSessionTtlHours(Math.max(0, parseInt(e.target.value || "0", 10)))}
                />
              }
            />
          </section>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t("accountManager.cancel")}
            </Button>
            <Button type="submit" disabled={!remark.trim() || !website.trim() || submitting}>
              {t("accountManager.confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AddAccountDialog({
  open,
  onOpenChange,
  stationName,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stationName: string;
  onSubmit: (username: string, password: string, notes: string) => void | Promise<void | boolean>;
}) {
  const { t } = useTranslation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordHidden, setPasswordHidden] = useState(true);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setUsername("");
    setPassword("");
    setPasswordHidden(true);
    setNotes("");
    setSubmitting(false);
  };

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const u = username.trim();
    if (!u) return;
    setSubmitting(true);
    try {
      await Promise.resolve(onSubmit(u, password, notes.trim()));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{t("accountManager.addAccountDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("accountManager.addAccountDialog.subtitle", { name: stationName })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field
              label={t("accountManager.fields.username")}
              icon={<UserRound size={14} />}
              input={<Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t("accountManager.addAccountDialog.usernamePlaceholder")} required />}
            />
            <Field
              label={t("accountManager.fields.password")}
              icon={<KeyRound size={14} />}
              input={
                <div className="flex items-center gap-2">
                  <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("accountManager.addAccountDialog.passwordPlaceholder")} type={passwordHidden ? "password" : "text"} />
                  <IconButton onClick={() => setPasswordHidden(h => !h)} icon={passwordHidden ? <Eye size={14} /> : <EyeOff size={14} />} label={passwordHidden ? t("accountManager.detail.revealPassword") : t("accountManager.detail.hidePassword")} />
                </div>
              }
            />
          </div>
          <Field
            label={t("accountManager.fields.notes")}
            icon={<StickyNote size={14} />}
            input={<Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("accountManager.addAccountDialog.notesPlaceholder")} rows={2} />}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={submitting || !username.trim()}>{submitting ? t("common.loading") : t("common.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditAccountDialog({
  open,
  account,
  stationName,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  account: StationAccount | null;
  stationName: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    username: string,
    notes: string,
    password: string | null,
    proxyEnabled: boolean
  ) => void | Promise<void | boolean>;
}) {
  const { t } = useTranslation();
  const [username, setUsername] = useState("");
  const [notes, setNotes] = useState("");
  const [password, setPassword] = useState("");
  const [passwordHidden, setPasswordHidden] = useState(true);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordDirty, setPasswordDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [proxyEnabled, setProxyEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (open && account) {
      setUsername(account.username);
      setNotes(account.notes);
      setPassword("");
      setPasswordHidden(true);
      setPasswordDirty(false);
      setSubmitting(false);
      setProxyEnabled(account.proxyEnabled ?? false);
      if (account.hasPassword) {
        setPasswordLoading(true);
        void api
          .revealPassword(account.id)
          .then((pw) => {
            if (!cancelled) setPassword(pw);
          })
          .catch(() => {
            if (!cancelled) toast.error(t("accountManager.toasts.revealPasswordFailed"));
          })
          .finally(() => {
            if (!cancelled) setPasswordLoading(false);
          });
      } else {
        setPasswordLoading(false);
      }
    }
    return () => {
      cancelled = true;
    };
  }, [open, account, t]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || passwordLoading) return;
    const u = username.trim();
    if (!u) return;
    setSubmitting(true);
    try {
      await Promise.resolve(
        onSubmit(u, notes.trim(), passwordDirty ? password : null, proxyEnabled),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onOpenChange(false);
      }}
    >
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{t("accountManager.editAccountDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("accountManager.editAccountDialog.subtitle", { name: stationName })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field
            label={t("accountManager.fields.username")}
            icon={<UserRound size={14} />}
            input={
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t("accountManager.addAccountDialog.usernamePlaceholder")}
                required
              />
            }
          />
          <Field
            label={t("accountManager.fields.password")}
            icon={<KeyRound size={14} />}
            input={
              <div className="flex items-center gap-2">
                <Input
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordDirty(true);
                  }}
                  placeholder={t("accountManager.editAccountDialog.passwordPlaceholder")}
                  type={passwordHidden ? "password" : "text"}
                  disabled={passwordLoading}
                />
                <IconButton
                  onClick={() => setPasswordHidden((hidden) => !hidden)}
                  icon={passwordHidden ? <Eye size={14} /> : <EyeOff size={14} />}
                  label={
                    passwordHidden
                      ? t("accountManager.detail.revealPassword")
                      : t("accountManager.detail.hidePassword")
                  }
                  disabled={passwordLoading}
                />
                {password.length > 0 ? (
                  <CopyIconButton
                    value={password}
                    label={t("accountManager.detail.copy")}
                  />
                ) : null}
              </div>
            }
          />
          <Field
            label={t("accountManager.fields.notes")}
            icon={<StickyNote size={14} />}
            input={
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("accountManager.editAccountDialog.notesPlaceholder")}
                rows={3}
              />
            }
          />
          <div className="flex items-center gap-2 rounded-lg border p-3">
            <input
              type="checkbox"
              id="proxyEnabled"
              checked={proxyEnabled}
              onChange={(e) => setProxyEnabled(e.target.checked)}
              className="size-4 accent-primary"
            />
            <label htmlFor="proxyEnabled" className="cursor-pointer text-sm">
              {t("accountManager.editAccountDialog.proxyEnabledLabel")}
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t("accountManager.cancel")}
            </Button>
            <Button type="submit" disabled={!username.trim() || submitting || passwordLoading}>
              {t("accountManager.confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteConfirmDialog({
  open,
  title,
  description,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
}) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="pt-2 text-sm">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("accountManager.cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void Promise.resolve(onConfirm())}
          >
            {t("accountManager.deleteAction")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Session Manager: Quick Login Dialog
export function QuickLoginDialog({
  open,
  onOpenChange,
  onSubmit,
  defaultStationId,
  history,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (url: string, username: string, destroyOnClose: boolean, stationId?: string | null) => void | Promise<void>;
  defaultStationId?: string | null;
  history?: string[];
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [destroyOnClose, setDestroyOnClose] = useState(false);

  useEffect(() => {
    if (!open) { setUrl(""); setUsername(""); setDestroyOnClose(false); }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("accountManager.sessionManager.quickLogin.title")}</DialogTitle>
          <DialogDescription>{t("accountManager.sessionManager.quickLogin.description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); void Promise.resolve(onSubmit(url, username, destroyOnClose, defaultStationId)); }} className="space-y-4">
          <Field label={t("accountManager.sessionManager.quickLogin.urlLabel")} icon={<Globe size={14} />} input={
            <div className="space-y-1">
              <Input value={url} onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com" required list="quick-login-history" />
              {history && history.length > 0 && (
                <>
                  <p className="text-xs text-muted-foreground">{t("accountManager.sessionManager.quickLogin.historyDatalist")}</p>
                  <datalist id="quick-login-history">
                    {history.map((h) => <option key={h} value={h} />)}
                  </datalist>
                </>
              )}
            </div>
          } />
          <Field label={t("accountManager.sessionManager.quickLogin.usernameLabel")} icon={<UserRound size={14} />} input={
            <Input value={username} onChange={(e) => setUsername(e.target.value)}
              placeholder="user@example.com" required />} />
          {defaultStationId && (
            <p className="text-xs text-muted-foreground">{t("accountManager.sessionManager.quickLogin.attachToStation")}</p>
          )}
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
            <input
              type="checkbox"
              checked={destroyOnClose}
              onChange={(e) => setDestroyOnClose(e.target.checked)}
              className="size-3.5 accent-blue-500"
            />
            {t("accountManager.sessionManager.quickLogin.destroyOnClose")}
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("accountManager.sessionManager.quickLogin.cancel")}</Button>
            <Button type="submit" disabled={!url.trim() || !username.trim()}>{t("accountManager.sessionManager.quickLogin.openButton")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// 外部登录代理:粘贴一条「用 bench 打开」的登录链接(bench-auth:// 或原始 https
// authorize 链接,如从浏览器地址栏复制的 Trae 登录页),无需把 bench 设为默认浏览器。
export function ProxyPasteDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (url: string) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setUrl("");
      setSubmitting(false);
    }
  }, [open]);

  const trimmed = url.trim();
  const looksValid =
    trimmed.startsWith("bench-auth://") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://");

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submitting) onOpenChange(next); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("accountManager.proxyPaste.title")}</DialogTitle>
          <DialogDescription>{t("accountManager.proxyPaste.description")}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!looksValid || submitting) return;
            setSubmitting(true);
            try {
              await onSubmit(trimmed);
            } finally {
              setSubmitting(false);
            }
          }}
          className="space-y-3"
        >
          <Field
            label={t("accountManager.proxyPaste.urlLabel")}
            icon={<Link2 size={14} />}
            input={
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.trae.cn/authorization?...&auth_callback_url=http://127.0.0.1:..."
                autoFocus
              />
            }
          />
          <p className="text-xs text-muted-foreground">
            {t("accountManager.proxyPaste.hint")}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t("accountManager.sessionManager.quickLogin.cancel")}
            </Button>
            <Button type="submit" disabled={!looksValid || submitting}>
              {submitting ? t("accountManager.proxyPaste.opening") : t("accountManager.proxyPaste.openButton")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
