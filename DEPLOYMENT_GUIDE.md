# Cloudflare Workers 云同步部署指南

## 🎯 目标
实现数据在 GitHub 和浏览器之间的自动同步，支持多电脑访问同一数据。

## 📋 部署步骤

### 第一步：创建 GitHub Token

1. 访问 https://github.com/settings/tokens
2. 点击 "Generate new token (classic)"
3. 填写信息：
   - Note: `Rent Manager Workers Token`
   - Expiration: 选择 "No expiration" 或 90 天
   - Select scopes: 勾选 `repo` 权限
4. 生成 Token，**复制并保存**（只会显示一次）

### 第二步：部署 Cloudflare Worker

1. 访问 https://dash.cloudflare.com/
2. 左侧菜单选择 "Workers & Pages"
3. 点击 "Create application" → "Create Worker"
4. 给 Worker 取名（如 `rent-manager`）
5. 点击 "Deploy"
6. 部署完成后，点击 "Edit code"
7. 删除默认代码，粘贴 `worker.js` 的全部内容
8. 点击 "Save and deploy"

### 第三步：配置环境变量

1. 在 Worker 页面，点击 "Settings"
2. 进入 "Variables" 部分
3. 添加以下变量（点击 "Add variable"）：

| 变量名 | 值 | 类型 |
|--------|-----|-------|
| GITHUB_TOKEN | 你的 GitHub Token | Text |
| GITHUB_OWNER | tan20130420 | Text |
| GITHUB_REPO | rent-manager | Text |

4. 点击 "Save and deploy"

### 第四步：获取 Worker URL

1. 返回 Worker 首页
2. 在页面上找到 "Routes" 部分
3. 复制你的 Worker URL（形如 `https://rent-manager.workers.dev`）

### 第五步：更新 index.html

1. 打开 `index.html`
2. 在最顶部 `<script>` 标签下找到：
   ```javascript
   // ===== STORE =====
   const S = {
   ```

3. 在这一行**前面**添加：
   ```javascript
   // ===== CLOUDFLARE WORKERS CONFIG =====
   const WORKER_URL = 'https://你的worker名字.workers.dev'; // 替换为你的 Worker URL
   const ENABLE_CLOUD_SYNC = true; // 设为 false 关闭云同步
   
   ```

4. 然后找到 `_save()` 方法（大约在第 258 行），替换为：
   ```javascript
   _save() { 
     localStorage.setItem('rentData', JSON.stringify(this._d));
     // 异步上传到 GitHub（不阻塞 UI）
     if (ENABLE_CLOUD_SYNC && WORKER_URL) {
       fetch(WORKER_URL + '/api/data', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(this._d)
       }).catch(e => console.log('Cloud sync failed:', e.message));
     }
   }
   ```

5. 找到 `init()` 方法，在 `this._save()` 前面添加从云端读取数据的逻辑：
   ```javascript
   async initCloud() {
     if (!ENABLE_CLOUD_SYNC || !WORKER_URL) return;
     try {
       const resp = await fetch(WORKER_URL + '/api/data');
       if (resp.ok) {
         const cloudData = await resp.json();
         if (cloudData && cloudData.rooms) {
           this._d = cloudData;
           console.log('Loaded data from cloud');
           return true;
         }
       }
     } catch(e) {
       console.log('Cloud load failed, using local data');
     }
     return false;
   }
   ```

6. 更新页面加载逻辑，在 `window.onload` 或 `DOMContentLoaded` 中：
   ```javascript
   window.addEventListener('DOMContentLoaded', async () => {
     S.init();
     // 尝试从云端同步
     const loaded = await S.initCloud();
     if (!loaded) {
       // 本地加载失败，使用默认数据
       S.init();
     }
     r(window.location.hash.slice(1) || 'dashboard');
   });
   ```

## ✅ 测试同步

1. **A 电脑**：打开应用，添加一条数据（如新增租户）
2. **观察**：应该能在浏览器开发工具 Network 标签看到 POST 请求到 `/api/data`
3. **B 电脑**：打开同一个应用 URL
4. **验证**：B 电脑应该能看到 A 电脑添加的数据

## 🔧 常见问题

### Q: 云同步失败怎么办？
**A**: 
- 检查 WORKER_URL 是否正确
- 检查 GitHub Token 是否有效
- 在浏览器控制台检查错误信息
- Token 过期需要重新生成

### Q: 想关闭云同步？
**A**: 
将 `ENABLE_CLOUD_SYNC` 改为 `false` 即可

### Q: 数据不同步？
**A**:
- 检查网络连接
- 查看浏览器开发工具 Network 和 Console 标签
- 确认 GitHub Token 有 repo 权限
- 重新部署 Worker

### Q: 怎样重置云端数据？
**A**:
在浏览器控制台执行：
```javascript
fetch(WORKER_URL + '/api/data', { method: 'DELETE' })
```

## 📊 数据流

```
A 电脑:
  用户操作 → localStorage 保存 → 自动上传到 GitHub（通过 Worker）
                                        ↓
                                   data.json
                                        ↑
B 电脑:
  页面加载 → 从 GitHub 下载最新数据（通过 Worker）→ localStorage
```

## 🎉 完成！

现在你可以在任意电脑访问同一个 URL，数据会自动同步！
