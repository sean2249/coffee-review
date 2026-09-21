// wrangler types 會把 wrangler.jsonc 裡的 vars 收斂成字面值型別，但 ACCESS_* 兩個
// 在正式部署時是由 deploy workflow 以 --var 覆寫的（jsonc 裡的 "" 只是本機預設），
// 所以在這裡放寬回 string，否則型別會謊稱它們永遠是空字串。
export type Env = Omit<Cloudflare.Env, 'APP_NAME' | 'ACCESS_TEAM_DOMAIN' | 'ACCESS_AUD'> & {
    APP_NAME: string;
    ACCESS_TEAM_DOMAIN: string;
    ACCESS_AUD: string;
};
