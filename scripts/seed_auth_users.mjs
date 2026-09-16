import { loadTsModule } from "../tests/load-ts.mjs";

const { supabase } = loadTsModule("src/shared/lib/supabase.ts");

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
];

async function seed() {
  const results = [];
  for (const item of USERS_TO_SEED) {
    const { data, error } = await supabase.auth.signUp({
      email: item.email,
      password: "Lidemoda2026!",
      options: {
        data: {
          nombre: item.nombre,
          rol: item.rol,
          sucursal_id: item.sucursal_id,
        },
      },
    });

    if (error && !error.message.includes("already registered")) {
      console.error(`Error registering ${item.email}:`, error.message);
    } else {
      results.push({ email: item.email, user: data?.user });
      console.log(`Registered or verified: ${item.email}`);
    }
  }
  return results;
}

await seed();
