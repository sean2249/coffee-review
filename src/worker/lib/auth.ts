import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import { verifyAccessJwt, accessEmail } from "./access";

type Vars = { auth: "access" | "open"; email: string; userId: string };
export type AppEnv = { Bindings: Env; Variables: Vars };

/** Access forwards the JWT as a header; browsers also carry it as a cookie. */
export function readAccessToken(headerJwt: string | undefined, cookieHeader: string | undefined): string | undefined {
    return headerJwt ?? readCookie(cookieHeader, "CF_Authorization");
}

function readCookie(header: string | undefined, name: string): string | undefined {
    if (!header) return undefined;
    for (const part of header.split(";")) {
        const [k, ...v] = part.trim().split("=");
        if (k === name) return v.join("=");
    }
    return undefined;
}

/**
 * Cloudflare Access sits in front in production and already rejects
 * unauthenticated requests before this Worker runs; verifying the forwarded JWT
 * here as well means a misconfigured or deleted Access application fails closed
 * instead of exposing every row.
 *
 * Both ACCESS_* vars empty = local dev / tests, where the identity comes from
 * DEV_USER_EMAIL instead. Half a configuration is a deployment mistake.
 */
export const requireAccess: MiddlewareHandler<AppEnv> = async (c, next) => {
    const aud = c.env.ACCESS_AUD;
    const team = c.env.ACCESS_TEAM_DOMAIN;

    if (!aud && !team) {
        // DEV_USER_EMAIL is only ever consulted on this branch, and the branch is
        // unreachable once ACCESS_AUD is set — so a stray dev var can never
        // downgrade production to an unauthenticated identity.
        const dev = c.env.DEV_USER_EMAIL;
        if (!dev) {
            throw new HTTPException(503, {
                message: "no identity: set ACCESS_TEAM_DOMAIN + ACCESS_AUD, or DEV_USER_EMAIL for local dev",
            });
        }
        c.set("auth", "open");
        c.set("email", dev);
        return next();
    }
    if (!aud || !team) {
        throw new HTTPException(503, {
            message: "Access misconfigured: set both ACCESS_TEAM_DOMAIN and ACCESS_AUD (or neither)",
        });
    }

    const jwt = readAccessToken(c.req.header("cf-access-jwt-assertion"), c.req.header("cookie"));
    if (!jwt) throw new HTTPException(401, { message: "access token required" });
    if (!(await verifyAccessJwt(jwt, team, aud))) throw new HTTPException(401, { message: "invalid access token" });

    const email = accessEmail(jwt);
    if (!email) throw new HTTPException(401, { message: "access token carries no email claim" });
    c.set("auth", "access");
    c.set("email", email);
    await next();
};
