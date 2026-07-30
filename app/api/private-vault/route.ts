import { ensureAdvancedSchema } from "../../../lib/advanced-store";
import { getLifeBindings } from "../../../lib/life-store";
import {
  getVaultSettings,
  isPrivateVaultUnlocked,
  lockedCookie,
  setVaultPin,
  unlockedCookie,
  verifyVaultPin,
} from "../../../lib/private-vault";

function pin(value: unknown) {
  return String(value ?? "").trim().slice(0, 20);
}

export async function GET(request: Request) {
  try {
    await ensureAdvancedSchema();
    const { DB } = getLifeBindings();
    const settings = await getVaultSettings(DB);
    return Response.json({
      configured: Boolean(settings),
      unlocked: settings
        ? await isPrivateVaultUnlocked(request, DB)
        : false,
      lockTimeoutMinutes: settings?.lock_timeout_minutes ?? 30,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "读取私密空间失败。" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureAdvancedSchema();
    const { DB } = getLifeBindings();
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "unlock");
    const current = await getVaultSettings(DB);
    if (action === "setup") {
      if (current) {
        return Response.json(
          { error: "私密空间已经设置密码，请先解锁后再修改。" },
          { status: 409 },
        );
      }
      await setVaultPin(
        DB,
        pin(body.pin),
        Number(body.lockTimeoutMinutes) || 30,
      );
    }
    const verified = await verifyVaultPin(DB, pin(body.pin));
    if (!verified) {
      return Response.json({ error: "独立密码不正确。" }, { status: 401 });
    }
    return new Response(
      JSON.stringify({ configured: true, unlocked: true }),
      {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "set-cookie": await unlockedCookie(
            verified,
            new URL(request.url).protocol === "https:",
          ),
        },
      },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "私密空间解锁失败。" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const reset = new URL(request.url).searchParams.get("reset") === "true";
  if (reset) {
    await ensureAdvancedSchema();
    const { DB } = getLifeBindings();
    if (!(await isPrivateVaultUnlocked(request, DB))) {
      return Response.json(
        { error: "重置独立密码前需要先解锁私密空间。" },
        { status: 403 },
      );
    }
    await DB.prepare(
      "DELETE FROM private_vault_settings WHERE id = 'default'",
    ).run();
  }
  return new Response(null, {
    status: 204,
    headers: {
      "set-cookie": lockedCookie(
        new URL(request.url).protocol === "https:",
      ),
    },
  });
}
