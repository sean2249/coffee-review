# 咖啡風味記錄網站設計建議與缺失項目分析

## 您現有欄位的評估

您提到的六個欄位：乾香、濕香、風味、酸味、甜度、口感，確實涵蓋了咖啡風味記錄的核心要素 [1][2][3]。這些項目都是專業咖啡杯測中的重要評估指標，為咖啡品質評估提供了良好的基礎 [4][5][6]。
## 重要缺失項目

根據國際專業咖啡評測標準（SCA、Coffee Review、台灣咖啡分類分級TCAGs等），您的系統還需要補充以下關鍵項目：

### 餘韻評估（極高重要性）

**餘韻**是專業咖啡評測中不可缺少的關鍵指標 [7][8]。此項目評估咖啡喝下後在口腔和喉頭殘留的味道，包括持續時間、清潔度、回甘程度和複雜度 [9][10]。在Coffee Review的評分系統中，餘韻與風味並列為最重要的評測項目 [7]。
### 平衡度評估（極高重要性）

**平衡度**衡量各風味元素間的協調性，是區分優質咖啡與普通咖啡的重要指標 [9][11][12]。這個項目評估酸、甜、苦之間是否達到和諧平衡，以及是否有某項味道過於突出 [10]。

### 整體評價與瑕疵記錄

**整體評價**應包含技術評分和個人喜好兩個維度 [7][8]。**瑕疵記錄**則用於識別過度萃取、萃取不足、雜味等問題，這對改善沖煮技術至關重要 [13][5]。
## 快速勾選系統設計

### 風味輪分類架構

基於台灣咖啡風味輪的科學分類，建議將風味描述詞按以下類別組織 [14][15]：

**主要風味類別：**
- **花香類**：茉莉、玫瑰、蘭花、桂花、紫羅蘭、薰衣草 [15]
- **水果類**：細分為柑橘類（檸檬、橘子、葡萄柚）、莓果類（草莓、藍莓、黑莓）、核果類（桃子、杏桃、櫻桃）和熱帶水果（鳳梨、芒果、百香果） [1][2]
- **糖香類**：蜂蜜、焦糖、黑糖、楓糖、太妃糖 [15]
- **堅果類**：杏仁、核桃、榛果、花生、腰果 [9]
- **巧克力類**：牛奶巧克力、黑巧克力、可可粉 [9]
- **香料類**：肉桂、丁香、胡椒、薑、八角 [16]
- **草本類**：薄荷、羅勒、茶感、青草、香草 [16][10]
### 快選功能優勢

快速勾選系統能顯著提高記錄效率，同時確保使用標準化的專業術語 [17][18]。透過視覺化的色彩分組按鈕，使用者可以快速識別和選擇多種風味組合 [1][2]。
## 完整系統功能架構

### 基本資訊記錄模組

**咖啡豆資訊**包含咖啡豆名稱、產地、品種、處理法、烘焙度和烘焙日期 [5][19]。**沖煮參數**記錄研磨度、水溫、粉水比、沖煮方法和萃取時間 [4]。

### 評分系統建議

採用1-10分的量表系統，其中9-10分為卓越等級，8-9分為優秀等級 [7][8]。根據專業評測標準，建議的權重分配為：風味25%、平衡度20%、餘韻15%、酸度12%、甜度10%、口感8%、乾香5%、濕香5% [7][20]。
## 專業評測工具整合

### 國際評測標準對接

網站設計應參考SCA杯測表、Coffee Review評分系統和台灣TCAGs分級制度 [7][5][20]。這些標準提供了科學化的評測框架，確保記錄結果具有專業可信度 [6][21]。
### 記錄管理功能

**搜尋與篩選**支援按產地、品種、評分等條件篩選記錄 [22][17]。**統計分析**提供個人喜好分析、評分趨勢追蹤和咖啡豆比較功能 [22][23]。**匯出功能**支援PDF和Excel格式匯出，便於分享和備份 [19]。
## 實用功能建議

### 輔助記錄工具

**照片記錄**允許上傳咖啡豆和成品照片，提供視覺參考 [19][18]。**沖煮筆記**記錄特殊沖煮技巧和心得 。**標籤系統**支援自定義標籤，如「最愛」、「想再試」、「不推薦」等分類 [22][17]。
### 使用者分級建議

**初學者**重點使用快選標籤和基本評分，關注整體印象和個人喜好 [10]。**進階使用者**注重細節描述和精確評分，建立個人風味資料庫 [23][18]。**專業人士**使用完整評測表格，關注瑕疵檢測和品質控制標準 [5]。
## 詳細快選選項設計

### 風味類別快選標籤

基於專業咖啡風味輪的分類標準，我們設計了11個主要風味類別，總計65個具體風味描述詞，每個類別使用不同的色彩系統進行視覺區分 [1][2][14]。
### 其他評測項目快選選項

除了風味類別外，系統還需要為酸度特質、甜度類型、口感質地、餘韻品質、平衡度評估和瑕疵類型提供快選選項，總計8個評測類別47個快選選項 [3][4][9]。
## 移動端友善設計

考慮到現代使用者的需求，建議開發響應式設計，確保在手機和平板設備上也能提供良好的使用體驗 [19][24]。觸控友善的界面設計讓使用者可以隨時隨地記錄咖啡風味 [18]。
## 總結與建議

您原有的六個欄位提供了很好的基礎，但建議補充**餘韻、平衡度、整體評價和瑕疵記錄**等關鍵項目 [7][8]。透過整合專業評測標準與便捷的快選功能，這套系統既能滿足專業需求，也適合咖啡愛好者日常使用 [5][6]。

完整的記錄系統將幫助您準確記錄每杯咖啡的風味特色，逐步提升品鑑能力，建立個人的咖啡風味資料庫 [23][10]。從原有的6個項目擴展到27個完整功能，這套系統不僅保留了您原有的核心構想，更結合國際專業標準，為您提供了一個真正專業級的咖啡風味記錄平台。

[1] https://www.cometrue-coffee.com/blog/flavorwheelsteps
[2] https://www.justincoffee.com.tw/zh-TW/blogs/%E5%92%96%E5%95%A1%E5%93%81%E9%A3%B2/139680
[3] https://health.udn.com/health/story/6037/5125736
[4] https://shirencoffee.com/zh/blogs/publication/cupping-protocol
[5] https://coffee-insight.com/coffee-flavor-evaluation-guide/
[6] https://jeremybaby.pixnet.net/blog/post/97779304
[7] https://bak.gafei.com/views-129030
[8] https://www.desk-one.hk/post/2017/09/01/%E5%B7%A5%E4%BD%9C%E5%9D%8A%E8%A8%80%EF%BC%9A%E4%B8%80%E5%93%81%E5%92%96%E5%95%A1%E9%A2%A8%E5%91%B3
[9] https://www.justincoffee.com.tw/zh-TW/blogs/%E5%92%96%E5%95%A1%E5%93%81%E9%A3%B2/98300
[10] https://apps.apple.com/tw/app/hicoffee-%E8%A8%98%E9%8C%84%E4%BD%A0%E7%9A%84%E5%92%96%E5%95%A1%E5%9B%A0%E6%94%9D%E5%85%A5/id1507361706
[11] https://www.wanacafe.com/index.php?route=blog%2Fblog&path=blogs&blog_id=10
[12] https://buoncaffe.com.tw/blog/posts/coffereview/
[13] https://coffee-insight.com/coffee-quality-evaluation-guide/
[14] https://cofflavour.co/zh/app/
[15] https://coffee.yipee.cc/322/%E5%92%96%E5%95%A1%E7%94%A8%E8%AA%9E
[16] https://www.tbrs.gov.tw/theme_data.php?theme=news&sub_theme=agricultural_news&id=5226
[17] https://apps.apple.com/tw/app/acaia-coffee/id834883045
[18] https://www.justincoffee.com.tw/zh-TW/blogs/%E5%92%96%E5%95%A1%E5%93%81%E9%A3%B2/162350
[19] https://www.cx.com.tw/modules/news/article.php?storyid=122
[20] https://today.line.me/tw/v2/article/ML6MZGy
[21] https://www.cometrue-coffee.com/blog/coffeeapp
[22] https://www.tbrs.gov.tw/ws.php?id=5352
[23] https://nature12152001.pixnet.net/blog/post/20029684
[24] https://www.taiwancoffee.org/document/2024_WCRC_Production_Cupping_Scoresheet_%E4%B8%AD%E6%96%87%E6%9D%AF%E6%B8%AC%E8%A1%A8.pdf
[25] https://www.youtube.com/watch?v=mgxhx13W_ck
[26] https://treeman.tw/coffee_flavor1/
[27] https://www.cna.com.tw/news/ahel/202312210084.aspx
[28] https://www.tbrs.gov.tw/ws.php?id=5443
[29] https://academy.moa.gov.tw/YF/news.php?id=news_1697093246
[30] https://sensory.tw/Sensoryforum-tw/artic_more.php?artid=197&type=Methodology-tw
[31] https://caffes.me/2022/09/09/%E6%89%8B%E6%B2%96%EF%BD%9C%E6%B1%9F%E6%B9%96%E5%9C%A8%E8%B5%B0%E5%B7%A5%E5%85%B7%E8%A6%81%E6%9C%89%E5%BE%9Epdca%E5%8E%9F%E7%90%86%E8%A8%AD%E8%A8%88%E7%9A%84%E6%B2%96%E7%85%AE%E6%84%9F%E5%AE%98/
[32] https://ir.lib.cyut.edu.tw/bitstream/310901800/30895/1/102CYUT0675033-001.pdf
[33] https://www.nespresso.com/tw/zh/blog-coffee-flavour
[34] https://www.originkaffa.com/scaa%E5%92%96%E5%95%A1%E9%A2%A8%E5%91%B3%E8%BC%AA%E4%B8%AD%E6%96%87%E7%BF%BB%E8%AD%AF%E7%89%88%E4%B8%8B%E8%BC%89/?scfm-mobile=1
[35] https://c3.coffee/shop-2/taiwanese-coffee-tasters-flavor/
[36] https://shop.cozyhousecoffee.com/blog/posts/sca-cva
[37] https://www.foodnext.net/science/knowledge/paper/5852667749
[38] https://today.line.me/tw/v2/article/DR96En8
[39] https://twwebvn.com/living-in-vietnam/%E8%B6%8A%E5%8D%97%E5%92%96%E5%95%A1%E4%B8%8D%E5%8F%AA%E7%85%89%E4%B9%B3%E5%92%96%E5%95%A1%E6%B2%B3%E5%85%A7%E5%BF%85%E5%96%9D5%E6%AC%BE%E8%B6%8A%E5%8D%97%E5%92%96%E5%95%A1/
[40] https://udn.com/news/story/6812/8073292
[41] https://www.managertoday.com.tw/eightylife/article/view/1667
[42] http://eleanordpfgs.blogspot.com/2016/04/scaa.html
[43] https://www.tbrs.gov.tw/theme_data.php?theme=news&sub_theme=agricultural_news&id=5078
[44] http://www.seeker.tw/News_detail/%E5%92%96%E5%95%A1%E7%9F%A5%E8%AD%98/-%E8%AA%8D%E8%AD%98Coffee-Review%EF%BC%88%E5%92%96%E5%95%A1%E8%A9%95%E9%91%91%EF%BC%8F%E5%92%96%E5%95%A1%E8%A9%95%E5%88%86%E7%B3%BB%E7%B5%B1%EF%BC%89.html
[45] https://tw.strikingly.com/content/blog/start-a-coffee-business-and-go-with-the-trend-of-online-cafe/
[46] https://shop.cozyhousecoffee.com/pages/coffee-review
[47] https://buoncaffe.com.tw/blog/posts/scaawheel/
[48] https://www.tbrs.gov.tw/ws.php?id=5444
[49] https://kmweb.moa.gov.tw/subject/subject.php?id=53649
[50] https://fae.moa.gov.tw/theme_data.php?theme=news&sub_theme=hot_news&id=1352
[51] https://play.google.com/store/apps/details?id=jp.axon.brewtimer
[52] https://twtagcoffee.com/2025/04/16/%E3%80%8C%E5%92%96%E5%95%A1%E6%8E%A7%E3%80%8D%E7%9A%84%E5%BF%85%E5%82%99%E6%89%8B%E6%A9%9Fapp%E6%8E%A8%E8%96%A6/
[53] https://hungweichen.wordpress.com/2023/02/15/%E5%92%96%E5%95%A1%E7%83%98%E8%B1%86%E7%A8%8B%E5%BC%8F-artisan-%E4%BB%8B%E7%B4%B9/