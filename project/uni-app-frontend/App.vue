<script>
export default {
  onLaunch: function () {
    console.log('App Launch')
  },
  onShow: function () {
    console.log('App Show')
  },
  onHide: function () {
    console.log('App Hide')
  }
}
</script>

<style>
/* =========================================================================
   全局 CSS 变量 — 蓝色主题
   安全生产社会化服务智检系统
   ========================================================================= */
:root {
  --primary: #1677FF;
  --primary-light: #e8f4fd;
  --primary-dark: #125388;
  --danger: #e74c3c;
  --success: #27ae60;
  --warning: #f39c12;
  --bg: #f4f7f9;
  --card-bg: #ffffff;
  --text: #333333;
  --text-secondary: #666666;
  --text-muted: #999999;
  --border: #e8e8e8;
  --border-light: #f0f0f0;
  --radius: 8px;
  --shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

/* 页面全局重置 */
page {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  color: var(--text);
  background-color: var(--bg);
  font-size: 14px;
  line-height: 1.5;
}

/* 通用容器 */
.container {
  padding: 20px;
  background-color: var(--bg);
  min-height: 100vh;
  box-sizing: border-box;
}

/* 通用卡片 */
.card {
  background-color: var(--card-bg);
  padding: 20px;
  border-radius: 12px;
  box-shadow: var(--shadow);
  margin-bottom: 20px;
}

/* 通用标题 */
.section-title {
  font-size: 18px;
  font-weight: bold;
  margin-bottom: 15px;
  display: block;
}

/* 通用小按钮 */
.mini-btn {
  padding: 5px 10px;
  font-size: 12px;
  border-radius: 5px;
  line-height: 1.5;
}

/* 通用提交按钮 */
.submit-btn {
  width: 100%;
  padding: 12px;
  border-radius: 10px;
  background-color: var(--primary);
  color: white;
  font-weight: bold;
  text-align: center;
  border: none;
}

.submit-btn:active {
  opacity: 0.85;
}

/* 滚动条美化 */
::-webkit-scrollbar {
  width: 4px;
}
::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 2px;
}
</style>
