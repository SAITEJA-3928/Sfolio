import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Input, Badge, Button, Card } from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, ShieldCheck, UserPlus, Trash2 } from "lucide-react";
import { customFetch } from "@/lib/custom-fetch";
import { buildAdminUsersApiUrl } from "@/lib/api-config";
import { formatDateTime } from "@/lib/utils";
import { getSortToggleClass, SortDirectionIcon, useTableSort } from "@/lib/table-sort";
import { toast } from "@/hooks/use-toast";
import { encryptPassword } from "@/utils/encryption";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import Tooltip from "@mui/material/Tooltip";
import { TablePaginationFooter } from "@/components/table-pagination-footer";
import { bindTablePaginationFooter, useTablePagination } from "@/lib/table-pagination";
import { usePersistedSearchTerm, createPersistedSearchTermKey } from "@/lib/persisted-page-filters";

type Admin = {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  isActive?: boolean;
  updatedAt?: string;
};

type AdminForm = {
  name: string;
  email: string;
  phone: string;
  role: string;
  password: string;
};
type AdminSortKey = "name"  | "created";

const GET_ADMINS_ENDPOINT = buildAdminUsersApiUrl("/admin/getAdmins");
const CREATE_ADMIN_ENDPOINT = buildAdminUsersApiUrl("/admin/createAdmin");
const DELETE_ADMIN_ENDPOINT = buildAdminUsersApiUrl("/admin/deleteAdmin");
const ADMINS_QUERY_KEY = [GET_ADMINS_ENDPOINT] as const;

const ADMIN_ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "corporate-admin", label: "Corporate Admin" },
  { value: "marketing", label: "Marketing" },
] as const;

const INITIAL_FORM: AdminForm = {
  name: "",
  email: "",
  phone: "",
  role: "admin",
  password: "",
};

function formatAdminRoleLabel(role?: string) {
  const normalized = normalizeSearchValue(role);
  if (normalized === "corporate-admin") return "Corporate Admin";
  if (normalized === "marketing") return "Marketing";
  if (normalized === "admin") return "Admin";
  return role ?? "-";
}

function normalizeSearchValue(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeAdmin(value: unknown): Admin | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const rawId = record.id ?? record._id ?? record.adminId ?? record.userId;
  const email = typeof record.email === "string" ? record.email : undefined;
  const phone = typeof record.phone === "string" ? record.phone : undefined;

  if (typeof rawId !== "string" && !email && !phone) return null;

  return {
    id: typeof rawId === "string" ? rawId : email ?? phone ?? crypto.randomUUID(),
    name: typeof record.name === "string" ? record.name : undefined,
    email,
    phone,
    role: typeof record.role === "string" ? record.role : undefined,
    isActive: typeof record.isActive === "boolean" ? record.isActive : undefined,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : undefined,
  };
}

function unwrapPayload(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  const record = data as Record<string, unknown>;
  return "data" in record ? record.data : data;
}

function normalizeAdmins(data: unknown): Admin[] {
  const payload = unwrapPayload(data);
  if (!payload) return [];

  if (Array.isArray(payload)) {
    return payload.map(normalizeAdmin).filter((admin): admin is Admin => admin !== null);
  }

  if (typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const list =
      (Array.isArray(record.admins) && record.admins) ||
      (Array.isArray(record.users) && record.users) ||
      (Array.isArray(record.result) && record.result) ||
      (Array.isArray(record.docs) && record.docs);

    if (list) {
      return list.map(normalizeAdmin).filter((admin): admin is Admin => admin !== null);
    }
  }

  const single = normalizeAdmin(payload);
  return single ? [single] : [];
}

async function fetchAdmins() {
  return customFetch(GET_ADMINS_ENDPOINT, { method: "GET" });
}

async function createAdmin(form: AdminForm) {
  const payload: Record<string, string> = {
    name: form.name.trim(),
    email: form.email.trim(),
    phone: form.phone.trim(),
    role: form.role,
  };

  if (form.role !== "corporate-admin" && form.password.trim()) {
    const encrypted = await encryptPassword(form.password);
    payload.password = encrypted.encrypted;
    payload.iv = encrypted.iv;
  }

  return customFetch<{ message?: string }>(CREATE_ADMIN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export default function CreateAdmin() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = usePersistedSearchTerm(createPersistedSearchTermKey("create-admin"));
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<AdminForm>(INITIAL_FORM);
  const [deleteAdmin, setDeleteAdmin] = useState<Admin | null>(null);
  const { sortKey, sortDirection, directionFactor, handleSort } =
    useTableSort<AdminSortKey>();

  const { data, isLoading, isError } = useQuery({
    queryKey: [...ADMINS_QUERY_KEY],
    queryFn: fetchAdmins,
  });

  const createMutation = useMutation({
    mutationFn: createAdmin,
    onSuccess: (response) => {
      toast({
        title: "Admin created",
        description:
          response?.message ||
          "The admin account has been created and a password reset link was sent to their email.",
      });
      setCreateOpen(false);
      setForm(INITIAL_FORM);
      void queryClient.invalidateQueries({ queryKey: [...ADMINS_QUERY_KEY] });
    },
    onError: (error) => {
      toast({
        title: "Create failed",
        description: error instanceof Error ? error.message : "Failed to create admin.",
        variant: "destructive",
      });
    },
  });

  const admins = useMemo(() => normalizeAdmins(data), [data]);

  const filteredAdmins = useMemo(() => {
    const term = normalizeSearchValue(searchTerm);
    if (!term) return admins;

    return admins.filter((admin) => {
      const name = normalizeSearchValue(admin.name);
      const email = normalizeSearchValue(admin.email);
      const phone = normalizeSearchValue(admin.phone);
      const role = normalizeSearchValue(admin.role);
      return name.includes(term) || email.includes(term) || phone.includes(term) || role.includes(term);
    });
  }, [admins, searchTerm]);

  const sortedAdmins = useMemo(() => {
    if (!sortKey) return filteredAdmins;

    return [...filteredAdmins].sort((a, b) => {
      if (sortKey === "name") {
        return normalizeSearchValue(a.name).localeCompare(normalizeSearchValue(b.name)) * directionFactor;
      }
      const aValue = new Date(a.updatedAt ?? 0).getTime();
      const bValue = new Date(b.updatedAt ?? 0).getTime();
      return (aValue - bValue) * directionFactor;
    });
  }, [directionFactor, filteredAdmins, sortKey]);
  const pagination = useTablePagination(sortedAdmins);

  useEffect(() => {
    pagination.resetPage();
  }, [pagination.resetPage, searchTerm]);

  const isCorporateAdminRole = form.role === "corporate-admin";

  const updateForm = (key: keyof AdminForm, value: string) => {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "role" && value === "corporate-admin") {
        next.password = "";
      }
      return next;
    });
  };

  const resetForm = () => {
    setForm(INITIAL_FORM);
  };

  const handleDelete = async (id: string) => {
    const result = await customFetch<{ message?: string }>(`${DELETE_ADMIN_ENDPOINT}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adminId: id }),
    });

    toast({
      title: "Admin deleted",
      description: result.message ?? "The admin account has been deleted successfully.",
    });
    void queryClient.invalidateQueries({ queryKey: [...ADMINS_QUERY_KEY] });
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast({ title: "Missing name", description: "Enter the admin name." });
      return;
    }

    if (!form.email.trim()) {
      toast({ title: "Missing email", description: "Enter the admin email." });
      return;
    }

    if (!form.phone.trim()) {
      toast({ title: "Missing phone", description: "Enter the admin phone number." });
      return;
    }

    if (!isCorporateAdminRole && !form.password.trim()) {
      toast({ title: "Missing password", description: "Enter a password for this admin." });
      return;
    }

    createMutation.mutate(form);
  };

  return (
    <Layout title="Create Admin">
      <Card className="flex h-[calc(100vh-7.5rem)] flex-col">
        <div className="p-6 border-b border-white/5 flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search admins by name, email or phone..."
              className="pl-10"
            />
          </div>

          <Button variant="outline" className="gap-2 cursor-pointer" onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-4 w-4" />
            Add Admin
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="table-head-sticky">
              <tr>
                <th className="px-4 py-4 ps-6 text-left font-medium">
                  <button type="button" onClick={() => handleSort("name")} className={getSortToggleClass(sortKey === "name")}>
                    Admin <SortDirectionIcon active={sortKey === "name"} direction={sortDirection} />
                  </button>
                </th>
                <th className="px-4 py-4 text-left font-medium">Phone</th>
                <th className="px-4 py-4 text-left font-medium">Role</th>
                <th className="px-4 py-4 text-center font-medium">
                  {/* <button type="button" onClick={() => handleSort("status")} className={getSortToggleClass(sortKey === "status")}> */}
                    Status 
                  {/* </button> */}
                </th>
                <th className="px-4 py-4 text-center font-medium">
                  <button type="button" onClick={() => handleSort("created")} className={getSortToggleClass(sortKey === "created")}>
                    Created <SortDirectionIcon active={sortKey === "created"} direction={sortDirection} />
                  </button>
                </th>
                <th className="px-4 py-4 text-center font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    Loading admins...
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-destructive">
                    Failed to load admins.
                  </td>
                </tr>
              ) : pagination.pagedItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    No admins found.
                  </td>
                </tr>
              ) : (
                pagination.pagedItems.map((admin) => (
                  <tr key={admin.id} className="border-b border-border transition-colors hover:bg-white/5">
                    <td className="px-4 py-4 ps-6">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20 font-bold text-primary">
                          {String(admin.name ?? admin.email ?? "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">{admin.name ?? "-"}</p>
                          <p className="truncate text-xs text-muted-foreground">{admin.email ?? "-"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">{admin.phone ?? "-"}</td>
                    <td className=" px-4 py-4">
                      <Badge variant={admin.role === "corporate-admin" ? "default" : "outline"}>
                        {formatAdminRoleLabel(admin.role)}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <Badge variant={admin.isActive === false ? "destructive" : "success"}>
                        {admin.isActive === false ? "INACTIVE" : "ACTIVE"}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-center text-muted-foreground">
                      {admin.updatedAt ? formatDateTime(admin.updatedAt) : "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-center">
                      <Tooltip title="Delete Admin" placement="bottom" >
                        <span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteAdmin(admin)}
                          >
                            <Trash2 className="w-4 h-4 !text-red-500" />
                          </Button>
                        </span>
                      </Tooltip>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <TablePaginationFooter {...bindTablePaginationFooter(pagination)} />
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md p-0">
          <DialogHeader className="border-b border-border px-5 py-4 text-left">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle>Create Admin</DialogTitle>
                <DialogDescription>
                  {isCorporateAdminRole
                    ? "Add a corporate admin account. A password reset link will be emailed after creation."
                    : "Add an admin account for dashboard access."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 px-5 py-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Name/Corporate Name</label>
              <Input
                value={form.name}
                onChange={(event) => updateForm("name", event.target.value)}
                placeholder="Name/Corporate Admin Name"
                className="h-11 rounded-xl border-border bg-background"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Email</label>
              <Input
                type="email"
                value={form.email}
                onChange={(event) => updateForm("email", event.target.value)}
                placeholder="coadmin@mailinator.com"
                className="h-11 rounded-xl border-border bg-background"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Phone</label>
              <Input
                value={form.phone}
                onChange={(event) => updateForm("phone", event.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="9876543201"
                className="h-11 rounded-xl border-border bg-background"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Role</label>
              <Select value={form.role} onValueChange={(value) => updateForm("role", value)}>
                <SelectTrigger className="h-11 rounded-xl border-border bg-background">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {ADMIN_ROLE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!isCorporateAdminRole && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Password</label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(event) => updateForm("password", event.target.value)}
                  placeholder="Enter password"
                  className="h-11 rounded-xl border-border bg-background"
                />
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-border px-5 py-3.5 sm:justify-between sm:space-x-0">
            <Button variant="ghost" className="cursor-pointer" onClick={resetForm} disabled={createMutation.isPending}>
              Reset
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                variant="outline"
                className="cursor-pointer"
                onClick={() => setCreateOpen(false)}
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
              <Button variant="default" className="cursor-pointer gap-2" onClick={handleSubmit} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={Boolean(deleteAdmin)}
        title="Delete Admin"
        message={`Are you sure you want to delete ${deleteAdmin?.name ?? "this admin"}?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onOpenChange={(open) => {
          if (!open) setDeleteAdmin(null);
        }}
        onConfirm={async () => {
          if (deleteAdmin) {
            await handleDelete(deleteAdmin.id);
            setDeleteAdmin(null);
          }
        }}
      />
    </Layout>
  );
}
