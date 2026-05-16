# Coffee Review

個人用咖啡杯測記錄工具，視覺呈現參考 **CoE (Cup of Excellence)** 國際精品咖啡比賽格式，但評分流程做了個人化客製：使用者直接決定總分，下方各項僅供對照印象。

## Project Purpose

提供一個簡單實用的網頁，讓人可以記錄、評估、整理咖啡品飲心得，並匯出 Markdown 方便分享或存檔。

## 評分流程

1. **CoE 總分（主分數，74-96）** — 使用者**直接輸入**，不是用下方項目加總。
   - 透過「兩段式徽章選擇」介面：先點徽章 → 再點該區間的分數
   - 預設：選中「一般精品（便利商店等級）」徽章 + 分數 82
2. **8 項細評（參考分，4-8，預設 5）** — 風味、酸質、甜度、口感、尾韻、乾淨度、平衡、整體。**不影響總分**，純粹給使用者對照各面向印象。
3. **香氣 Aroma** — **觀察項，不計分**。可記錄乾香 / 濕香文字，並從風味輪勾選關鍵詞。
4. **瑕疵記錄 / 最終備註** — 自由文字。

## 徽章 / 分數區間表

| 徽章 | 分數區間 | 可選分數（step 0.5）|
|------|---------|-------------------|
| 垃圾咖啡 | ≤ 76 | 74, 74.5, 75, 75.5, 76, 76.5 |
| 商業咖啡 | 77-79 | 77, 77.5, 78, 78.5, 79, 79.5 |
| 一般精品（便利商店等級）| 80-82 | 80, 80.5, 81, 81.5, 82, 82.5 |
| 平常喜歡的精品 | 83-85 | 83, 83.5, 84, 84.5, 85, 85.5 |
| 會推薦給朋友的精品 | 86-88 | 86, 86.5, 87, 87.5, 88, 88.5 |
| 覺得超級驚艷，想重複喝的 | 89-91 | 89, 89.5, 90, 90.5, 91, 91.5 |
| 神級 | ≥ 92 | 92, 92.5, 93, 93.5, 94, 94.5, 95, 95.5, 96 |

> 每個非神級區間都包含「該區間上限 + 0.5」的天花板分數（例如 76.5 仍歸「垃圾咖啡」、77 起跳「商業咖啡」），用來表達「快要進入下一級」的細微感受。

## 功能

- 沖煮參數 / 咖啡資訊 欄位
- 風味輪三層 tag 父子連動（風味、香氣項共用）
- 口感重量/質地、尾韻長度/質地 多選
- localStorage 儲存多筆記錄、可命名、可刪除
- Markdown 匯出 + 一鍵複製

## Using GitHub Pages

You can use GitHub Pages to create a simple, viewable website for your coffee reviews. The `index.html` in this repository is a starting point.

To set up GitHub Pages:
1.  Go to your repository on GitHub.
2.  Click on the "Settings" tab.
3.  In the left sidebar, click on "Pages".
4.  Under "Build and deployment", for the "Source", select "Deploy from a branch".
5.  Under "Branch", select `main` (or your default branch) and `/ (root)` folder, then click "Save".
6.  Your site will be published at an address like `https://sean2249.github.io/coffee-review/`.

You can edit the `index.html` file to add your reviews and they will appear on your new website.
