import { createClient } from "@supabase/supabase-js";

const requiredEnv = (name, fallbackName) => {
  const value = process.env[name] || (fallbackName ? process.env[fallbackName] : undefined);
  if (!value) {
    const fallbackHint = fallbackName ? ` or ${fallbackName}` : "";
    throw new Error(`${name}${fallbackHint} is required to seed auth users`);
  }
  return value;
};

const supabaseUrl = requiredEnv("EXPO_PUBLIC_SUPABASE_URL");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const seedPassword = requiredEnv("SEED_AUTH_PASSWORD", "TEST_SMOKE_PASSWORD");

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const USERS_TO_SEED = [
  {
    email: "admin.lidemoda@gmail.com",
    nombre: "Administrador General",
    rol: "admin",
    sucursal_id: null,
  },
  {
    email: "encargada.comercio@gmail.com",
    nombre: "Patricia Morales",
    rol: "encargada",
    sucursal_id: 1,
  },
  {
    email: "cajera.montenegro@gmail.com",
    nombre: "Valeria Mendoza",
    rol: "cajera",
    sucursal_id: 2,
  },
  {
    email: "vendedora.ceja@gmail.com",
    nombre: "Silvia Flores",
    rol: "vendedora",
    sucursal_id: 3,
  },
  {
    email: "almacen.central@gmail.com",
    nombre: "Carlos Quispe",
    rol: "almacen",
    sucursal_id: 1,
  },
  {
    email: "marketing.lidemoda@gmail.com",
    nombre: "Equipo Marketing",
    rol: "marketing",
    sucursal_id: null,
  },
  {
    email: "reponedora.lidemoda@gmail.com",
    nombre: "Reponedora Central",
    rol: "reponedora",
    sucursal_id: 1,
  },
  {
    email: "supervisora.regional@gmail.com",
    nombre: "Supervisora Regional",
    rol: "admin",
    sucursal_id: null,
  },
];

async function listExistingUsers() {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`Could not list auth users: ${error.message}`);
  return new Map(data.users.map((user) => [user.email?.toLowerCase(), user]));
}

async function ensureAuthUser(item, existingUsers) {
  const existing = existingUsers.get(item.email.toLowerCase());
  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      email_confirm: true,
      password: seedPassword,
      user_metadata: { nombre: item.nombre },
    });
    if (error) throw new Error(`Could not update ${item.email}: ${error.message}`);
    return data.user;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: item.email,
    password: seedPassword,
    email_confirm: true,
    user_metadata: { nombre: item.nombre },
  });
  if (error) throw new Error(`Could not create ${item.email}: ${error.message}`);
  return data.user;
}

async function ensureProfile(item, userId) {
  const { error } = await supabase.from("perfiles").upsert(
    {
      id: userId,
      email: item.email,
      nombre: item.nombre,
      rol: item.rol,
      sucursal_id: item.sucursal_id,
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(`Could not upsert profile for ${item.email}: ${error.message}`);
}

async function seed() {
  const existingUsers = await listExistingUsers();
  for (const item of USERS_TO_SEED) {
    const user = await ensureAuthUser(item, existingUsers);
    await ensureProfile(item, user.id);
    console.log(`Seeded auth profile: ${item.email}`);
  }
}

await seed();
