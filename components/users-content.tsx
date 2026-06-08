"use client";

import { useState, useEffect, useMemo } from "react";
import pb from "@/lib/pocketbase";
import { useInvestors } from "@/lib/investors-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ErrorDialog } from "@/components/ui/error-dialog";
import { formatPbError, type PbErrorInfo } from "@/lib/pb-error";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Users, ShieldCheck, User, AlertCircle, Crown, TrendingUp, ShieldAlert, Check, X as XIcon } from "lucide-react";
import { useSettings, type RolePermissions, DEFAULT_ROLE_PERMISSIONS } from "@/lib/settings-context";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface AppUser {
  id:         string;
  email:      string;
  name:       string;
  role:       string;
  investorId: string;
  verified:   boolean;
  created:    string;
}

interface UserFormData {
  name:            string;
  email:           string;
  role:            string;
  investorId:      string;
  password:        string;
  passwordConfirm: string;
  changePassword:  boolean;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

function formatDate(s: string) {
  const d = new Date(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function recordToUser(r: Record<string, unknown>): AppUser {
  return {
    id:         r.id         as string,
    email:      r.email      as string,
    name:       (r.name      as string) || "",
    role:       (r.role      as string) || "user",
    investorId: (r.investorId as string) || "",
    verified:   (r.verified  as boolean) || false,
    created:    r.created    as string,
  };
}

const emptyForm = (): UserFormData => ({
  name: "", email: "", role: "user", investorId: "",
  password: "", passwordConfirm: "", changePassword: false,
});

const ROLE_LABELS: Record<string, string> = {
  admin:    "Admin",
  user:     "User",
  owner:    "Owner",
  investor: "Investor",
};

// ─────────────────────────────────────────────
// Permissions Panel
// ─────────────────────────────────────────────

const PERM_LABELS: { key: keyof import("@/lib/settings-context").RolePermission; label: string; desc: string }[] = [
  { key: "create", label: "Tambah Data",  desc: "Membuat entri baru (investor, transaksi, PKS, dll)" },
  { key: "edit",   label: "Edit Data",    desc: "Mengubah data yang sudah ada"                        },
  { key: "delete", label: "Hapus Data",   desc: "Menghapus entri secara permanen"                     },
  { key: "print",  label: "Cetak / Ekspor", desc: "Mencetak dokumen PKS dan mengekspor data"          },
];

const CONFIGURABLE_ROLES: { key: keyof RolePermissions; label: string; color: string }[] = [
  { key: "user",     label: "User",     color: "text-blue-600"   },
  { key: "owner",    label: "Owner",    color: "text-purple-600" },
  { key: "investor", label: "Investor", color: "text-green-600"  },
];

function PermissionsPanel({
  permissions, onToggle, onSave, onReset, isSaving, isSaved, isDirty,
}: {
  permissions: RolePermissions;
  onToggle: (role: keyof RolePermissions, action: keyof RolePermissions[keyof RolePermissions]) => void;
  onSave:   () => void;
  onReset:  () => void;
  isSaving: boolean;
  isSaved:  boolean;
  isDirty:  boolean;
}) {
  return (
    <div className="space-y-6">
      {/* Info admin */}
      <Card className="border-dashed">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Admin selalu memiliki akses penuh</p>
              <p className="text-xs text-muted-foreground">Hak akses di bawah hanya berlaku untuk role User, Owner, dan Investor.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grid permission */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Konfigurasi Hak Akses per Role</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground w-1/2">Hak Akses</th>
                  {CONFIGURABLE_ROLES.map((r) => (
                    <th key={r.key} className={`text-center py-3 px-4 font-semibold ${r.color}`}>{r.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERM_LABELS.map((perm) => (
                  <tr key={perm.key} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="py-3 px-4">
                      <p className="font-medium">{perm.label}</p>
                      <p className="text-xs text-muted-foreground">{perm.desc}</p>
                    </td>
                    {CONFIGURABLE_ROLES.map((r) => (
                      <td key={r.key} className="py-3 px-4 text-center">
                        <div className="flex justify-center">
                          <Switch
                            checked={permissions[r.key][perm.key]}
                            onCheckedChange={() => onToggle(r.key, perm.key)}
                            aria-label={`${r.label} - ${perm.label}`}
                          />
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Ringkasan per role */}
      <div className="grid gap-4 md:grid-cols-3">
        {CONFIGURABLE_ROLES.map((r) => (
          <Card key={r.key}>
            <CardHeader className="pb-2">
              <CardTitle className={`text-sm font-semibold ${r.color}`}>{r.label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {PERM_LABELS.map((perm) => (
                <div key={perm.key} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{perm.label}</span>
                  {permissions[r.key][perm.key]
                    ? <Check className="h-3.5 w-3.5 text-green-500" />
                    : <XIcon className="h-3.5 w-3.5 text-muted-foreground/40" />
                  }
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Aksi */}
      <div className="flex items-center gap-3">
        <Button onClick={onSave} disabled={!isDirty || isSaving}>
          {isSaving ? "Menyimpan..." : "Simpan Perubahan"}
        </Button>
        <Button variant="outline" onClick={onReset} disabled={isSaving}>
          Reset Default
        </Button>
        {isSaved && (
          <span className="flex items-center gap-1.5 text-sm text-green-600">
            <Check className="h-4 w-4" />
            Tersimpan
          </span>
        )}
        {isDirty && !isSaved && (
          <span className="text-xs text-muted-foreground">Ada perubahan yang belum disimpan</span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

export function UsersContent() {
  const { investors } = useInvestors();

  const [users,       setUsers]       = useState<AppUser[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [fetchError,  setFetchError]  = useState("");
  const [isAddOpen,   setIsAddOpen]   = useState(false);
  const [isEditOpen,  setIsEditOpen]  = useState(false);
  const [isDeleteOpen,setIsDeleteOpen]= useState(false);
  const [selected,    setSelected]    = useState<AppUser | null>(null);
  const [form,        setForm]        = useState<UserFormData>(emptyForm());
  const [formError,   setFormError]   = useState("");
  const [isSubmitting,setIsSubmitting]= useState(false);
  const [errorInfo,   setErrorInfo]   = useState<PbErrorInfo | null>(null);

  const { rolePermissions, updatePermissions } = useSettings();
  const [permDraft,     setPermDraft]     = useState<RolePermissions | null>(null);
  const [isSavingPerm,  setIsSavingPerm]  = useState(false);
  const [permSaved,     setPermSaved]     = useState(false);

  const currentPermissions = permDraft ?? rolePermissions;

  const togglePerm = (
    role: keyof RolePermissions,
    action: keyof RolePermissions[typeof role]
  ) => {
    const base = permDraft ?? rolePermissions;
    setPermDraft({
      ...base,
      [role]: { ...base[role], [action]: !base[role][action] },
    });
    setPermSaved(false);
  };

  const savePerm = async () => {
    if (!permDraft) return;
    setIsSavingPerm(true);
    try {
      await updatePermissions(permDraft);
      setPermDraft(null);
      setPermSaved(true);
      setTimeout(() => setPermSaved(false), 2500);
    } finally {
      setIsSavingPerm(false);
    }
  };

  const resetPerm = () => {
    setPermDraft(DEFAULT_ROLE_PERMISSIONS);
    setPermSaved(false);
  };

  const currentUserId = pb.authStore.record?.id as string | undefined;

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    setLoading(true);
    setFetchError("");
    try {
      const records = await pb.collection("users").getFullList({ sort: "created" });
      setUsers(records.map(recordToUser));
    } catch {
      setFetchError(
        'Gagal memuat data user. Pastikan API Rules koleksi "users" sudah diset dengan benar.'
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Metrics ──
  const metrics = useMemo(() => ({
    total:    users.length,
    admins:   users.filter((u) => u.role === "admin").length,
    owners:   users.filter((u) => u.role === "owner").length,
    investors: users.filter((u) => u.role === "investor").length,
    regular:  users.filter((u) => u.role === "user").length,
  }), [users]);

  // ── Tambah user ──
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (form.password !== form.passwordConfirm) {
      setFormError("Password tidak cocok");
      return;
    }
    setIsSubmitting(true);
    try {
      const record = await pb.collection("users").create({
        email:           form.email,
        emailVisibility: true,
        name:            form.name,
        role:            form.role,
        investorId:      form.role === "investor" ? form.investorId : "",
        password:        form.password,
        passwordConfirm: form.passwordConfirm,
      });
      setUsers((prev) => [...prev, recordToUser(record)]);
      setIsAddOpen(false);
      setForm(emptyForm());
    } catch (e: unknown) {
      const info = formatPbError(e, "Gagal membuat user");
      if (info.fields.length > 0) {
        setFormError(info.fields.map((f) => `${f.field}: ${f.message}`).join(" · "));
      } else {
        setFormError(info.title);
      }
      setErrorInfo(info);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Edit user ──
  const openEdit = (u: AppUser) => {
    setSelected(u);
    setForm({ ...emptyForm(), name: u.name, email: u.email, role: u.role, investorId: u.investorId });
    setFormError("");
    setIsEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setFormError("");
    if (form.changePassword) {
      if (form.password !== form.passwordConfirm) {
        setFormError("Password tidak cocok");
        return;
      }
      if (form.password.length < 8) {
        setFormError("Password minimal 8 karakter");
        return;
      }
    }
    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name:       form.name,
        role:       form.role,
        investorId: form.role === "investor" ? form.investorId : "",
      };
      if (form.changePassword && form.password) {
        payload.password        = form.password;
        payload.passwordConfirm = form.passwordConfirm;
      }
      const record = await pb.collection("users").update(selected.id, payload);
      setUsers((prev) => prev.map((u) => (u.id === selected.id ? recordToUser(record) : u)));
      setIsEditOpen(false);
      setSelected(null);
      setForm(emptyForm());
    } catch (e: unknown) {
      const info = formatPbError(e, "Gagal mengupdate user");
      setFormError(info.title);
      setErrorInfo(info);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Hapus user ──
  const confirmDelete = async () => {
    if (!selected) return;
    try {
      await pb.collection("users").delete(selected.id);
      setUsers((prev) => prev.filter((u) => u.id !== selected.id));
    } catch (e) {
      setErrorInfo(formatPbError(e, "Gagal menghapus user"));
    } finally {
      setSelected(null);
      setIsDeleteOpen(false);
    }
  };

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <div className="animate-pulse">Memuat data user...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Manajemen User</h1>
        <p className="text-muted-foreground">Kelola akun pengguna dan hak akses aplikasi MinBun ERP</p>
      </div>

      <Tabs defaultValue="pengguna">
        <TabsList>
          <TabsTrigger value="pengguna"><Users className="w-4 h-4 mr-2" />Pengguna</TabsTrigger>
          <TabsTrigger value="hak-akses"><ShieldAlert className="w-4 h-4 mr-2" />Hak Akses</TabsTrigger>
        </TabsList>

        {/* ══ TAB: PENGGUNA ══ */}
        <TabsContent value="pengguna" className="space-y-6 mt-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div />

        <Dialog
          open={isAddOpen}
          onOpenChange={(open) => {
            setIsAddOpen(open);
            if (!open) { setForm(emptyForm()); setFormError(""); }
          }}
        >
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />Tambah User</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[460px]">
            <DialogHeader>
              <DialogTitle>Tambah User Baru</DialogTitle>
              <DialogDescription>
                Buat akun pengguna baru. User langsung bisa login setelah dibuat.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleAdd} className="space-y-4 mt-2">
              {formError && (
                <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  {formError}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="add-name" className="text-xs">Nama Lengkap</Label>
                <Input
                  id="add-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Nama pengguna"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="add-email" className="text-xs">
                  Email <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="add-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="user@email.com"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">
                  Role <span className="text-destructive">*</span>
                </Label>
                <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v, investorId: "" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User — input data</SelectItem>
                    <SelectItem value="admin">Admin — akses penuh</SelectItem>
                    <SelectItem value="owner">Owner — lihat &amp; edit semua</SelectItem>
                    <SelectItem value="investor">Investor — portal investor</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.role === "investor" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Investor <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={form.investorId}
                    onValueChange={(v) => setForm((f) => ({ ...f, investorId: v }))}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih investor…" />
                    </SelectTrigger>
                    <SelectContent>
                      {investors.length === 0 ? (
                        <div className="py-4 text-center text-xs text-muted-foreground">
                          Belum ada data investor
                        </div>
                      ) : (
                        investors.map((inv) => (
                          <SelectItem key={inv.id} value={inv.id}>
                            <span className="font-mono text-xs text-muted-foreground mr-2">{inv.id}</span>
                            {inv.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Pilih investor yang terhubung ke akun ini
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="add-pass" className="text-xs">
                    Password <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="add-pass"
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="Min. 8 karakter"
                    required
                    minLength={8}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="add-confirm" className="text-xs">
                    Konfirmasi <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="add-confirm"
                    type="password"
                    value={form.passwordConfirm}
                    onChange={(e) => setForm((f) => ({ ...f, passwordConfirm: e.target.value }))}
                    placeholder="Ulangi password"
                    required
                  />
                </div>
              </div>

              <DialogFooter className="pt-2 border-t">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Menyimpan..." : "Buat User"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Metrics ── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total User</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.total}</div>
            <p className="text-xs text-muted-foreground">akun terdaftar</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Admin</CardTitle>
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.admins}</div>
            <p className="text-xs text-muted-foreground">akses penuh</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Owner</CardTitle>
            <Crown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.owners}</div>
            <p className="text-xs text-muted-foreground">lihat & edit data</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Investor</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.investors}</div>
            <p className="text-xs text-muted-foreground">portal investor</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Fetch error ── */}
      {fetchError && (
        <div className="flex items-start gap-2 p-4 text-sm text-destructive bg-destructive/10 rounded-lg">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          {fetchError}
        </div>
      )}

      {/* ── Tabel ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daftar Akun</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-muted-foreground gap-2">
              <Users className="h-10 w-10" />
              <p className="text-sm">Belum ada user terdaftar</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left  py-3 px-4 font-medium text-muted-foreground">Nama</th>
                    <th className="text-left  py-3 px-4 font-medium text-muted-foreground">Email</th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">Role</th>
                    <th className="text-left  py-3 px-4 font-medium text-muted-foreground">Dibuat</th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4 font-medium">
                        {u.name || <span className="text-muted-foreground italic">—</span>}
                        {u.id === currentUserId && (
                          <span className="ml-2 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                            Anda
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">{u.email}</td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant={
                          u.role === "admin" ? "default" :
                          u.role === "owner" ? "outline" :
                          u.role === "investor" ? "secondary" : "secondary"
                        }>
                          {ROLE_LABELS[u.role] ?? u.role}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">
                        {formatDate(u.created)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => openEdit(u)}
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => { setSelected(u); setIsDeleteOpen(true); }}
                            disabled={u.id === currentUserId}
                            title={u.id === currentUserId ? "Tidak bisa hapus akun sendiri" : "Hapus"}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Edit Dialog ── */}
      <Dialog
        open={isEditOpen}
        onOpenChange={(open) => {
          setIsEditOpen(open);
          if (!open) { setSelected(null); setForm(emptyForm()); setFormError(""); }
        }}
      >
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Ubah nama, role, atau password untuk{" "}
              <strong>{selected?.name || selected?.email}</strong>
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEdit} className="space-y-4 mt-2">
            {formError && (
              <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                {formError}
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Nama Lengkap</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nama pengguna"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <div className="px-3 py-2 bg-muted rounded-md text-sm text-muted-foreground">
                {form.email}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v, investorId: "" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User — input data</SelectItem>
                  <SelectItem value="admin">Admin — akses penuh</SelectItem>
                  <SelectItem value="owner">Owner — lihat &amp; edit semua</SelectItem>
                  <SelectItem value="investor">Investor — portal investor</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.role === "investor" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Investor</Label>
                <Select
                  value={form.investorId}
                  onValueChange={(v) => setForm((f) => ({ ...f, investorId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih investor…" />
                  </SelectTrigger>
                  <SelectContent>
                    {investors.length === 0 ? (
                      <div className="py-4 text-center text-xs text-muted-foreground">
                        Belum ada data investor
                      </div>
                    ) : (
                      investors.map((inv) => (
                        <SelectItem key={inv.id} value={inv.id}>
                          <span className="font-mono text-xs text-muted-foreground mr-2">{inv.id}</span>
                          {inv.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Investor yang terhubung ke akun ini
                </p>
              </div>
            )}

            {/* Ganti password (opsional) */}
            <div className="space-y-3 border-t pt-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.changePassword}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      changePassword: e.target.checked,
                      password: "",
                      passwordConfirm: "",
                    }))
                  }
                  className="h-4 w-4 rounded"
                />
                <span className="text-sm">Ganti password</span>
              </label>

              {form.changePassword && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      Password Baru <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                      placeholder="Min. 8 karakter"
                      required
                      minLength={8}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      Konfirmasi <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="password"
                      value={form.passwordConfirm}
                      onChange={(e) => setForm((f) => ({ ...f, passwordConfirm: e.target.value }))}
                      placeholder="Ulangi"
                      required
                    />
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="pt-2 border-t">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

        </TabsContent>{/* end pengguna */}

        {/* ══ TAB: HAK AKSES ══ */}
        <TabsContent value="hak-akses" className="space-y-6 mt-6">
          <PermissionsPanel
            permissions={currentPermissions}
            onToggle={togglePerm}
            onSave={savePerm}
            onReset={resetPerm}
            isSaving={isSavingPerm}
            isSaved={permSaved}
            isDirty={permDraft !== null}
          />
        </TabsContent>

      </Tabs>

      {/* ── Delete Dialog ── */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Hapus User</DialogTitle>
            <DialogDescription>
              Yakin ingin menghapus akun{" "}
              <strong>{selected?.name || selected?.email}</strong>?{" "}
              Tindakan ini tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>Batal</Button>
            <Button variant="destructive" onClick={confirmDelete}>Hapus</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Error dialog ── */}
      <ErrorDialog
        open={!!errorInfo}
        onClose={() => setErrorInfo(null)}
        error={errorInfo}
      />
    </div>
  );
}
