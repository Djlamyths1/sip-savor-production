import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type PermissionLevel = "none" | "enter" | "view" | "manage";

type PermissionInput = {
  permission_code: string;
  permission_level: PermissionLevel;
};

type RequestBody = {
  action: "create" | "update" | "disable" | "enable" | "list";
  user_id?: string;
  email?: string;
  password?: string;
  role?: string;
  permissions?: PermissionInput[];
};

const allowedRoles = [
  "admin",
  "hr",
  "inventory_officer",
  "production_officer",
] as const;

const allowedLevels: PermissionLevel[] = [
  "none",
  "enter",
  "view",
  "manage",
];

function getAllowedOrigin(req: Request): string {
  const origin = req.headers.get("Origin");

  const configuredOrigins = (Deno.env.get("APP_ORIGINS") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const developmentOrigins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175",
  ];

  const allowedOrigins = new Set([
    ...developmentOrigins,
    ...configuredOrigins,
  ]);

  if (origin && allowedOrigins.has(origin)) {
    return origin;
  }

  return "http://localhost:5173";
}

function corsHeaders(req: Request) {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(req),
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function jsonResponse(
  req: Request,
  body: Record<string, unknown>,
  status = 200
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json",
    },
  });
}

function isValidRole(role: unknown): boolean {
  return (
    typeof role === "string" &&
    allowedRoles.includes(role as (typeof allowedRoles)[number])
  );
}

function isValidPermissionLevel(
  level: unknown
): level is PermissionLevel {
  return (
    typeof level === "string" &&
    allowedLevels.includes(level as PermissionLevel)
  );
}

function isValidEmail(email: unknown): boolean {
  return (
    typeof email === "string" &&
    email.trim().length > 0 &&
    email.includes("@") &&
    email.length <= 320
  );
}

function isValidPassword(password: unknown): boolean {
  return typeof password === "string" && password.length >= 8;
}

function isValidUserId(userId: unknown): boolean {
  return (
    typeof userId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      userId
    )
  );
}

async function countAdmins(
  serviceClient: ReturnType<typeof createClient>
): Promise<number> {
  const { count, error } = await serviceClient
    .from("user_roles")
    .select("user_id", { count: "exact", head: true })
    .eq("role", "admin");

  if (error) {
    throw new Error(`Unable to verify administrator count: ${error.message}`);
  }

  return count ?? 0;
}

async function verifyCallerIsAdmin(
  req: Request,
  serviceClient: ReturnType<typeof createClient>,
  anonKey: string
) {
  const authorization = req.headers.get("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return {
      error: jsonResponse(
        req,
        { error: "Missing authorization token" },
        401
      ),
    };
  }

  const token = authorization.replace("Bearer ", "").trim();

  if (!token) {
    return {
      error: jsonResponse(
        req,
        { error: "Missing authorization token" },
        401
      ),
    };
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    anonKey,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    }
  );

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return {
      error: jsonResponse(
        req,
        { error: "Invalid or expired authentication token" },
        401
      ),
    };
  }

  const { data: roleRow, error: roleError } = await serviceClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (roleError) {
    return {
      error: jsonResponse(
        req,
        { error: "Unable to verify administrator permissions" },
        500
      ),
    };
  }

  if (roleRow?.role !== "admin") {
    return {
      error: jsonResponse(
        req,
        { error: "Administrator access required" },
        403
      ),
    };
  }

  return {
    user,
    token,
  };
}

async function validatePermissions(
  serviceClient: ReturnType<typeof createClient>,
  permissions: unknown
): Promise<PermissionInput[]> {
  if (permissions === undefined) {
    return [];
  }

  if (!Array.isArray(permissions)) {
    throw new Error("permissions must be an array");
  }

  const cleaned = permissions.map((permission) => {
    if (!permission || typeof permission !== "object") {
      throw new Error("Invalid permission entry");
    }

    const item = permission as Record<string, unknown>;

    if (
      typeof item.permission_code !== "string" ||
      !item.permission_code.trim()
    ) {
      throw new Error("Invalid permission_code");
    }

    if (!isValidPermissionLevel(item.permission_level)) {
      throw new Error(
        `Invalid permission level for ${item.permission_code}`
      );
    }

    return {
      permission_code: item.permission_code.trim(),
      permission_level: item.permission_level,
    };
  });

  const uniqueCodes = [...new Set(cleaned.map((p) => p.permission_code))];

  if (uniqueCodes.length !== cleaned.length) {
    throw new Error("Duplicate permission codes are not allowed");
  }

  if (uniqueCodes.length === 0) {
    return [];
  }

  const { data: catalogRows, error: catalogError } =
    await serviceClient
      .from("permission_catalog")
      .select("permission_code")
      .in("permission_code", uniqueCodes);

  if (catalogError) {
    throw new Error(
      `Unable to validate permissions: ${catalogError.message}`
    );
  }

  const validCodes = new Set(
    (catalogRows ?? []).map((row) => row.permission_code)
  );

  const invalidCodes = uniqueCodes.filter(
    (code) => !validCodes.has(code)
  );

  if (invalidCodes.length > 0) {
    throw new Error(
      `Unknown permission code(s): ${invalidCodes.join(", ")}`
    );
  }

  return cleaned;
}

async function replaceUserPermissions(
  serviceClient: ReturnType<typeof createClient>,
  userId: string,
  permissions: PermissionInput[]
) {
  const { error: deleteError } = await serviceClient
    .from("user_permissions")
    .delete()
    .eq("user_id", userId);

  if (deleteError) {
    throw new Error(
      `Unable to clear existing permissions: ${deleteError.message}`
    );
  }

  const activePermissions = permissions.filter(
    (permission) => permission.permission_level !== "none"
  );

  if (activePermissions.length === 0) {
    return;
  }

  const rows = activePermissions.map((permission) => ({
    user_id: userId,
    permission_code: permission.permission_code,
    permission_level: permission.permission_level,
  }));

  const { error: insertError } = await serviceClient
    .from("user_permissions")
    .insert(rows);

  if (insertError) {
    throw new Error(
      `Unable to save permissions: ${insertError.message}`
    );
  }
}

async function ensureRoleRow(
  serviceClient: ReturnType<typeof createClient>,
  userId: string,
  role: string
) {
  const { error } = await serviceClient
    .from("user_roles")
    .upsert(
      {
        user_id: userId,
        role,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id",
      }
    );

  if (error) {
    throw new Error(`Unable to save user role: ${error.message}`);
  }
}

async function listUsers(
  req: Request,
  serviceClient: ReturnType<typeof createClient>
) {
  const users: Array<Record<string, unknown>> = [];
  const perPage = 100;
  let page = 1;

  while (true) {
    const { data, error } = await serviceClient.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(`Unable to list users: ${error.message}`);
    }

    users.push(
      ...(data.users ?? []).map((user) => ({
        id: user.id,
        email: user.email ?? null,
        created_at: user.created_at,
        updated_at: user.updated_at,
        last_sign_in_at: user.last_sign_in_at ?? null,
        email_confirmed_at: user.email_confirmed_at ?? null,
        banned_until: user.banned_until ?? null,
      }))
    );

    if (!data.users || data.users.length < perPage) {
      break;
    }

    page += 1;
  }

  const userIds = users
    .map((user) => user.id)
    .filter((id): id is string => typeof id === "string");

  const rolesByUser = new Map<string, string>();
  const permissionsByUser = new Map<string, PermissionInput[]>();

  if (userIds.length > 0) {
    const { data: roleRows, error: roleError } =
      await serviceClient
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);

    if (roleError) {
      throw new Error(
        `Unable to load user roles: ${roleError.message}`
      );
    }

    for (const row of roleRows ?? []) {
      rolesByUser.set(row.user_id, row.role);
    }

    const { data: permissionRows, error: permissionError } =
      await serviceClient
        .from("user_permissions")
        .select("user_id, permission_code, permission_level")
        .in("user_id", userIds);

    if (permissionError) {
      throw new Error(
        `Unable to load user permissions: ${permissionError.message}`
      );
    }

    for (const row of permissionRows ?? []) {
      const existing =
        permissionsByUser.get(row.user_id) ?? [];

      existing.push({
        permission_code: row.permission_code,
        permission_level: row.permission_level,
      });

      permissionsByUser.set(row.user_id, existing);
    }
  }

  const result = users.map((user) => {
    const userId = user.id as string;

    return {
      ...user,
      role: rolesByUser.get(userId) ?? null,
      permissions: permissionsByUser.get(userId) ?? [],
      is_active: !user.banned_until,
    };
  });

  return jsonResponse(req, { users: result });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders(req),
    });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse(
        req,
        { error: "Method not allowed" },
        405
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY"
    );
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return jsonResponse(
        req,
        { error: "Supabase server configuration is missing" },
        500
      );
    }

    const serviceClient = createClient(
      supabaseUrl,
      serviceRoleKey
    );

    const authResult = await verifyCallerIsAdmin(
      req,
      serviceClient,
      anonKey
    );

    if (authResult.error) {
      return authResult.error;
    }

    const caller = authResult.user;

    let body: RequestBody;

    try {
      body = await req.json();
    } catch {
      return jsonResponse(
        req,
        { error: "Invalid JSON request body" },
        400
      );
    }

    if (
      !body ||
      !["create", "update", "disable", "enable", "list"].includes(
        body.action
      )
    ) {
      return jsonResponse(
        req,
        { error: "Invalid action" },
        400
      );
    }

    if (body.action === "list") {
      return await listUsers(req, serviceClient);
    }

    if (
      body.action !== "create" &&
      !isValidUserId(body.user_id)
    ) {
      return jsonResponse(
        req,
        { error: "A valid user_id is required" },
        400
      );
    }

    if (
      body.action === "create" ||
      body.action === "update"
    ) {
      if (body.email !== undefined && !isValidEmail(body.email)) {
        return jsonResponse(
          req,
          { error: "A valid email address is required" },
          400
        );
      }

      if (
        body.password !== undefined &&
        !isValidPassword(body.password)
      ) {
        return jsonResponse(
          req,
          { error: "Password must contain at least 8 characters" },
          400
        );
      }

      if (body.role !== undefined && !isValidRole(body.role)) {
        return jsonResponse(
          req,
          { error: "Invalid role" },
          400
        );
      }

      if (body.permissions !== undefined) {
        try {
          await validatePermissions(
            serviceClient,
            body.permissions
          );
        } catch (error) {
          return jsonResponse(
            req,
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Invalid permissions",
            },
            400
          );
        }
      }
    }

    if (body.action === "create") {
      if (!body.email || !body.password || !body.role) {
        return jsonResponse(
          req,
          {
            error:
              "email, password and role are required when creating a user",
          },
          400
        );
      }

      let createdUserId: string | null = null;

      try {
        const { data: created, error: createError } =
          await serviceClient.auth.admin.createUser({
            email: body.email.trim().toLowerCase(),
            password: body.password,
            email_confirm: true,
          });

        if (createError || !created.user) {
          throw new Error(
            createError?.message ?? "Unable to create user"
          );
        }

        createdUserId = created.user.id;

        await ensureRoleRow(
          serviceClient,
          createdUserId,
          body.role
        );

        const permissions = await validatePermissions(
          serviceClient,
          body.permissions ?? []
        );

        await replaceUserPermissions(
          serviceClient,
          createdUserId,
          permissions
        );

        return jsonResponse(req, {
          success: true,
          user: {
            id: createdUserId,
            email: created.user.email ?? body.email,
            role: body.role,
          },
        });
      } catch (error) {
        if (createdUserId) {
          await serviceClient.auth.admin.deleteUser(
            createdUserId
          );
        }

        return jsonResponse(
          req,
          {
            error:
              error instanceof Error
                ? error.message
                : "Unable to create user",
          },
          400
        );
      }
    }

    const targetUserId = body.user_id!;

    const { data: targetRoleRow, error: targetRoleError } =
      await serviceClient
        .from("user_roles")
        .select("role")
        .eq("user_id", targetUserId)
        .maybeSingle();

    if (targetRoleError) {
      return jsonResponse(
        req,
        { error: "Unable to load target user's role" },
        500
      );
    }

    const targetRole = targetRoleRow?.role ?? null;

    if (
      (body.action === "disable" ||
        body.action === "update") &&
      targetUserId === caller.id
    ) {
      if (body.action === "disable") {
        return jsonResponse(
          req,
          { error: "You cannot disable your own account" },
          400
        );
      }

      if (
        body.role !== undefined &&
        body.role !== "admin"
      ) {
        return jsonResponse(
          req,
          { error: "You cannot remove administrator access from your own account" },
          400
        );
      }
    }

    if (body.action === "disable") {
      if (targetRole === "admin") {
        const adminCount = await countAdmins(serviceClient);

        if (adminCount <= 1) {
          return jsonResponse(
            req,
            {
              error:
                "The last administrator account cannot be disabled",
            },
            400
          );
        }
      }

      const { error: disableError } =
        await serviceClient.auth.admin.updateUserById(
          targetUserId,
          {
            ban_duration: "876000h",
          }
        );

      if (disableError) {
        return jsonResponse(
          req,
          { error: disableError.message },
          400
        );
      }

      return jsonResponse(req, {
        success: true,
        message: "User disabled successfully",
      });
    }

    if (body.action === "enable") {
      const { error: enableError } =
        await serviceClient.auth.admin.updateUserById(
          targetUserId,
          {
            ban_duration: "none",
          }
        );

      if (enableError) {
        return jsonResponse(
          req,
          { error: enableError.message },
          400
        );
      }

      return jsonResponse(req, {
        success: true,
        message: "User enabled successfully",
      });
    }

    if (body.action === "update") {
      const changingAdminRole =
        body.role !== undefined &&
        targetRole === "admin" &&
        body.role !== "admin";

      if (changingAdminRole) {
        const adminCount = await countAdmins(serviceClient);

        if (adminCount <= 1) {
          return jsonResponse(
            req,
            {
              error:
                "The last administrator account cannot be demoted",
            },
            400
          );
        }
      }

      const authUpdates: Record<string, unknown> = {};

      if (body.email !== undefined) {
        authUpdates.email = body.email.trim().toLowerCase();
        authUpdates.email_confirm = true;
      }

      if (body.password !== undefined) {
        authUpdates.password = body.password;
      }

      if (Object.keys(authUpdates).length > 0) {
        const { error: authUpdateError } =
          await serviceClient.auth.admin.updateUserById(
            targetUserId,
            authUpdates
          );

        if (authUpdateError) {
          return jsonResponse(
            req,
            { error: authUpdateError.message },
            400
          );
        }
      }

      if (body.role !== undefined) {
        await ensureRoleRow(
          serviceClient,
          targetUserId,
          body.role
        );
      }

      if (body.permissions !== undefined) {
        const permissions = await validatePermissions(
          serviceClient,
          body.permissions
        );

        await replaceUserPermissions(
          serviceClient,
          targetUserId,
          permissions
        );
      }

      return jsonResponse(req, {
        success: true,
        message: "User updated successfully",
      });
    }

    return jsonResponse(
      req,
      { error: "Unsupported action" },
      400
    );
  } catch (error) {
    console.error("manage-user error:", error);

    return jsonResponse(
      req,
      {
        error:
          error instanceof Error
            ? error.message
            : "Internal server error",
      },
      500
    );
  }
});

