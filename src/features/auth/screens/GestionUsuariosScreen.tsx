import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  Dialog,
  Divider,
  Portal,
  RadioButton,
  Snackbar,
  Text,
  TextInput,
} from "react-native-paper";
import { ScreenContainer } from "../../../shared/components/ScreenContainer";
import { AppHeader } from "../../../shared/components/AppHeader";
import { PermissionDenied } from "../components/PermissionDenied";
import { colors, spacing } from "../../../shared/theme";
import { useAuth } from "../hooks/useAuth";
import { can, roleLabels } from "../lib/permissions";
import type { Role } from "../lib/authTypes";
import { useSucursales } from "../../../shared/hooks/useSucursales";
import {
  createCollaboratorUser,
  fetchUserProfiles,
  updateUserProfile,
  type UserProfileItem,
} from "../api/usersApi";

const ROLES_ORDER: Role[] = [
  "admin",
  "encargada",
  "cajera",
  "vendedora",
  "almacen",
  "reponedora",
  "marketing",
];

export function GestionUsuariosScreen() {
  const { profile } = useAuth();
  const sucursalesQuery = useSucursales();
  const [users, setUsers] = useState<UserProfileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Edit dialog state
  const [editingUser, setEditingUser] = useState<UserProfileItem | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role>("vendedora");
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [snackMsg, setSnackMsg] = useState<string | null>(null);

  // Create collaborator dialog state
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [newNombre, setNewNombre] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<Role>("vendedora");
  const [newBranchId, setNewBranchId] = useState<number | null>(1);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const data = await fetchUserProfiles();
      setUsers(data);
    } catch (err: any) {
      setErrorMsg(err.message || "Error al cargar colaboradores.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  if (!can(profile?.rol, "users.manage")) {
    return (
      <PermissionDenied message="Solo el administrador general puede acceder a la gestión de colaboradores y asignación de roles." />
    );
  }

  const openEdit = (u: UserProfileItem) => {
    setEditingUser(u);
    setSelectedRole(u.rol);
    setSelectedBranchId(u.sucursal_id);
  };

  const closeEdit = () => {
    setEditingUser(null);
  };

  const handleSave = async () => {
    if (!editingUser) return;
    try {
      setSaving(true);
      const branchToSave = selectedRole === "admin" ? null : selectedBranchId;
      await updateUserProfile(editingUser.id, selectedRole, branchToSave);
      setSnackMsg(`Rol de ${editingUser.nombre ?? editingUser.email} actualizado a ${roleLabels[selectedRole]}.`);
      closeEdit();
      void loadData();
    } catch (err: any) {
      setErrorMsg(err.message || "No se pudo actualizar el perfil.");
    } finally {
      setSaving(false);
    }
  };

  const openCreate = () => {
    setNewNombre("");
    setNewEmail("");
    setNewPassword("");
    setNewRole("vendedora");
    setNewBranchId(sucursalesQuery.data?.[0]?.id ?? 1);
    setCreateError(null);
    setIsCreatingUser(true);
  };

  const closeCreate = () => {
    if (creating) return;
    setIsCreatingUser(false);
  };

  const handleCreate = async () => {
    const cleanNombre = newNombre.trim();
    const cleanEmail = newEmail.trim().toLowerCase();

    if (!cleanNombre) {
      setCreateError("Ingresá el nombre completo del colaborador.");
      return;
    }
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setCreateError("Ingresá un correo electrónico válido.");
      return;
    }
    if (newPassword && newPassword.length < 6) {
      setCreateError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    try {
      setCreating(true);
      setCreateError(null);
      await createCollaboratorUser({
        nombre: cleanNombre,
        email: cleanEmail,
        password: newPassword || "Lidemoda2026!",
        rol: newRole,
        sucursalId: newRole === "admin" ? null : newBranchId,
      });

      setSnackMsg(`Colaborador ${cleanNombre} registrado con éxito.`);
      closeCreate();
      void loadData();
    } catch (err: any) {
      setCreateError(err.message || "Error al crear el colaborador.");
    } finally {
      setCreating(false);
    }
  };

  const getRoleColor = (rol: Role) => {
    switch (rol) {
      case "admin":
        return "#7C3AED";
      case "encargada":
        return "#2563EB";
      case "cajera":
      case "vendedora":
        return "#059669";
      case "almacen":
        return "#D97706";
      case "reponedora":
        return "#4B5563";
      case "marketing":
        return "#DB2777";
      default:
        return colors.textSecondary;
    }
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <AppHeader
          title="Colaboradores y Roles"
          subtitle="Gobierno y asignación de permisos"
        />

        <View style={styles.introCard}>
          <Text variant="bodyMedium" style={styles.introText}>
            Como Administrador General, tu rol es analítico y de supervisión. Podés consultar métricas globales de toda la cadena y gobernar los accesos asignando el rol y la sucursal de trabajo de cada colaboradora.
          </Text>
        </View>

        <View style={styles.actionHeader}>
          <View style={{ flex: 1 }}>
            <Text variant="titleMedium" style={styles.actionHeaderTitle}>
              Equipo ({users.length})
            </Text>
            <Text variant="bodySmall" style={styles.muted}>
              Colaboradores y permisos
            </Text>
          </View>
          <Button
            mode="contained"
            icon="account-plus"
            onPress={openCreate}
            style={styles.createButton}
            labelStyle={{ fontWeight: "700" }}
          >
            Nuevo Colaborador
          </Button>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
            <Text style={styles.muted}>Cargando colaboradores de Supabase...</Text>
          </View>
        ) : errorMsg ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>{errorMsg}</Text>
            <Button mode="outlined" onPress={() => void loadData()}>
              Reintentar
            </Button>
          </View>
        ) : (
          <View style={styles.list}>
            {users.map((u) => {
              const isSelf = u.id === profile?.id;
              const roleBadgeColor = getRoleColor(u.rol);
              return (
                <Card key={u.id} mode="outlined" style={styles.userCard}>
                  <Card.Content style={styles.userCardContent}>
                    <View style={styles.userHeader}>
                      <View style={{ flex: 1 }}>
                        <Text variant="titleMedium" style={styles.userName}>
                          {u.nombre || "Sin nombre registrado"} {isSelf ? "(Tú)" : ""}
                        </Text>
                        <Text variant="bodySmall" style={styles.userEmail}>
                          {u.email}
                        </Text>
                      </View>
                      <Chip
                        compact
                        textStyle={{ color: "#FFFFFF", fontWeight: "600", fontSize: 11 }}
                        style={{ backgroundColor: roleBadgeColor }}
                      >
                        {roleLabels[u.rol]}
                      </Chip>
                    </View>

                    <View style={styles.userFooter}>
                      <Text variant="bodySmall" style={styles.branchLabel}>
                        📍 Sucursal:{" "}
                        <Text style={{ fontWeight: "600", color: colors.textPrimary }}>
                          {u.sucursal_nombre}
                        </Text>
                      </Text>

                      <Button
                        mode="contained-tonal"
                        compact
                        onPress={() => openEdit(u)}
                        disabled={isSelf}
                      >
                        {isSelf ? "Fijo" : "Modificar Rol"}
                      </Button>
                    </View>
                  </Card.Content>
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Dialog for creating a new collaborator */}
      <Portal>
        <Dialog visible={isCreatingUser} onDismiss={closeCreate}>
          <Dialog.Title>Registrar Nuevo Colaborador</Dialog.Title>
          <Dialog.ScrollArea style={{ maxHeight: 440 }}>
            <ScrollView contentContainerStyle={{ paddingVertical: spacing.sm }}>
              {createError ? (
                <Text style={styles.errorText}>{createError}</Text>
              ) : null}

              <TextInput
                label="Nombre Completo *"
                placeholder="Ej: Mariana López"
                value={newNombre}
                onChangeText={setNewNombre}
                mode="outlined"
                dense
                style={styles.dialogInput}
              />

              <TextInput
                label="Correo Electrónico *"
                placeholder="colaborador@lidemoda.com"
                value={newEmail}
                onChangeText={setNewEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                mode="outlined"
                dense
                style={styles.dialogInput}
              />

              <TextInput
                label="Contraseña"
                placeholder="Por defecto: Lidemoda2026!"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                mode="outlined"
                dense
                style={styles.dialogInput}
              />
              <Text variant="bodySmall" style={[styles.muted, { marginBottom: spacing.sm }]}>
                Si lo dejás vacío, se asignará "Lidemoda2026!".
              </Text>

              <Divider style={{ marginVertical: spacing.xs }} />

              <Text variant="titleSmall" style={styles.sectionTitle}>
                Rol Operativo:
              </Text>
              <RadioButton.Group
                onValueChange={(val) => setNewRole(val as Role)}
                value={newRole}
              >
                {ROLES_ORDER.map((r) => (
                  <View key={r} style={styles.radioRow}>
                    <RadioButton.Item
                      label={`${roleLabels[r]} ${r === "admin" ? "(Analítico Global)" : ""}`}
                      value={r}
                      mode="android"
                      style={{ paddingVertical: 2 }}
                    />
                  </View>
                ))}
              </RadioButton.Group>

              {newRole !== "admin" && (
                <>
                  <Divider style={{ marginVertical: spacing.xs }} />
                  <Text variant="titleSmall" style={[styles.sectionTitle, { marginTop: spacing.xs }]}>
                    Sucursal Asignada:
                  </Text>
                  <RadioButton.Group
                    onValueChange={(val) => setNewBranchId(Number(val))}
                    value={newBranchId ? String(newBranchId) : ""}
                  >
                    {sucursalesQuery.data?.map((suc) => (
                      <View key={suc.id} style={styles.radioRow}>
                        <RadioButton.Item
                          label={`${suc.nombre} (${suc.ciudad})`}
                          value={String(suc.id)}
                          mode="android"
                          style={{ paddingVertical: 2 }}
                        />
                      </View>
                    ))}
                  </RadioButton.Group>
                </>
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={closeCreate} disabled={creating}>
              Cancelar
            </Button>
            <Button mode="contained" onPress={() => void handleCreate()} loading={creating}>
              Registrar
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Dialog for modifying user role and branch */}
      <Portal>
        <Dialog visible={editingUser !== null} onDismiss={closeEdit}>
          <Dialog.Title>Asignar Rol y Sucursal</Dialog.Title>
          <Dialog.ScrollArea style={{ maxHeight: 420 }}>
            <ScrollView>
              {editingUser && (
                <View style={{ paddingVertical: spacing.sm }}>
                  <Text variant="labelLarge" style={{ marginBottom: spacing.xs }}>
                    Colaborador: {editingUser.nombre ?? editingUser.email}
                  </Text>

                  <Text variant="titleSmall" style={styles.sectionTitle}>
                    Seleccionar Rol:
                  </Text>
                  <RadioButton.Group
                    onValueChange={(val) => setSelectedRole(val as Role)}
                    value={selectedRole}
                  >
                    {ROLES_ORDER.map((r) => (
                      <View key={r} style={styles.radioRow}>
                        <RadioButton.Item
                          label={`${roleLabels[r]} ${r === "admin" ? "(Analítico Global)" : ""}`}
                          value={r}
                          mode="android"
                          style={{ paddingVertical: 2 }}
                        />
                      </View>
                    ))}
                  </RadioButton.Group>

                  {selectedRole !== "admin" && (
                    <>
                      <Text variant="titleSmall" style={[styles.sectionTitle, { marginTop: spacing.md }]}>
                        Sucursal Asignada:
                      </Text>
                      <RadioButton.Group
                        onValueChange={(val) => setSelectedBranchId(Number(val))}
                        value={selectedBranchId ? String(selectedBranchId) : ""}
                      >
                        {sucursalesQuery.data?.map((suc) => (
                          <View key={suc.id} style={styles.radioRow}>
                            <RadioButton.Item
                              label={`${suc.nombre} (${suc.ciudad})`}
                              value={String(suc.id)}
                              mode="android"
                              style={{ paddingVertical: 2 }}
                            />
                          </View>
                        ))}
                      </RadioButton.Group>
                    </>
                  )}
                </View>
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={closeEdit} disabled={saving}>
              Cancelar
            </Button>
            <Button mode="contained" onPress={() => void handleSave()} loading={saving}>
              Guardar Cambios
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar
        visible={snackMsg !== null}
        onDismiss={() => setSnackMsg(null)}
        duration={3000}
      >
        {snackMsg}
      </Snackbar>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  introCard: {
    backgroundColor: "#F3F4F6",
    padding: spacing.md,
    borderRadius: 8,
    marginBottom: spacing.lg,
  },
  introText: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
  center: {
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.xxxl,
  },
  muted: {
    color: colors.textSecondary,
  },
  errorText: {
    color: colors.danger,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  list: {
    gap: spacing.md,
  },
  userCard: {
    backgroundColor: colors.surface,
  },
  userCardContent: {
    gap: spacing.sm,
  },
  userHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  userName: {
    fontWeight: "700",
    color: colors.textPrimary,
  },
  userEmail: {
    color: colors.textSecondary,
  },
  userFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  branchLabel: {
    color: colors.textSecondary,
  },
  actionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  actionHeaderTitle: {
    fontWeight: "700",
    color: colors.textPrimary,
  },
  createButton: {
    borderRadius: 8,
  },
  dialogInput: {
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    marginTop: spacing.sm,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  radioRow: {
    marginVertical: -4,
  },
});
