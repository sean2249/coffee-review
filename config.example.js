/* ---------------------------------------------------------------------------
   本地開發：把這個檔複製為 config.js（已加入 .gitignore），填入你的 Supabase
   credentials。

       cp config.example.js config.js
       # 然後編輯 config.js

   GitHub Pages 部署：什麼都不用做。.github/workflows/deploy.yml 會用
   repository secrets（SUPABASE_URL / SUPABASE_ANON_KEY）自動產生 config.js。
   --------------------------------------------------------------------------- */
window.SUPABASE_CONFIG = {
    url: '',                  // e.g. 'https://xxxxx.supabase.co'
    anonKey: '',              // 'sb_publishable_...' 或舊版 anon JWT
    // 以下欄位有預設值（app.js 內），需要改才寫
    // schema:       'coffee',
    // cuppingTable: 'cupping_records',
    // tastingTable: 'tasting_records',
    // shopsTable:   'shops',
};
