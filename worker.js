/**
 * Cloudflare Workers 脚本
 * 用途：作为中间服务器，安全地读写 GitHub 数据
 * 
 * 部署步骤：
 * 1. 访问 https://dash.cloudflare.com/
 * 2. 进入 Workers 页面，创建新 Worker
 * 3. 复制粘贴下面的代码
 * 4. 设置环境变量：GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO
 * 5. 部署后，记录 Worker URL（形如 https://xxx.workers.dev）
 * 6. 在 index.html 中更新 WORKER_URL
 */

const GITHUB_OWNER = 'tan20130420';
const GITHUB_REPO = 'rent-manager';
const DATA_FILE = 'data.json';
const GITHUB_API = 'https://api.github.com';

// 从环境变量中读取 Token（需要在 Cloudflare 仪表板设置）
const GITHUB_TOKEN = GITHUB_TOKEN || '';

// CORS 响应头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

async function handleRequest(request) {
  // 处理 CORS 预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(request.url);

  // GET /api/data - 读取数据
  if (request.method === 'GET' && url.pathname === '/api/data') {
    return handleGetData();
  }

  // POST /api/data - 保存数据
  if (request.method === 'POST' && url.pathname === '/api/data') {
    return handlePostData(request);
  }

  // DELETE /api/data - 删除数据（重置）
  if (request.method === 'DELETE' && url.pathname === '/api/data') {
    return handleDeleteData();
  }

  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: corsHeaders
  });
}

// 读取 GitHub 文件
async function handleGetData() {
  try {
    const response = await fetch(
      `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${DATA_FILE}`,
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3.raw'
        }
      }
    );

    if (response.status === 404) {
      // 文件不存在，返回空对象
      return new Response(
        JSON.stringify({
          rooms: [],
          tenants: [],
          bills: [],
          ledger: [],
          nid: { r: 10, t: 100, b: 100, l: 100 }
        }),
        { headers: corsHeaders }
      );
    }

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = await response.text();
    return new Response(data, { headers: corsHeaders });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: corsHeaders }
    );
  }
}

// 保存数据到 GitHub
async function handlePostData(request) {
  try {
    const newData = await request.json();

    // 1. 先获取当前文件的 SHA（用于更新）
    let sha = null;
    const getResponse = await fetch(
      `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${DATA_FILE}`,
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );

    if (getResponse.ok) {
      const fileData = await getResponse.json();
      sha = fileData.sha;
    }

    // 2. 将数据编码为 Base64
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(newData, null, 2))));

    // 3. 提交到 GitHub
    const commitBody = {
      message: `Auto sync data - ${new Date().toISOString()}`,
      content: content,
      sha: sha // 如果 SHA 存在，会更新；否则创建新文件
    };

    const commitResponse = await fetch(
      `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${DATA_FILE}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(commitBody)
      }
    );

    if (!commitResponse.ok) {
      throw new Error(`Failed to commit: ${commitResponse.status}`);
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Data saved to GitHub' }),
      { headers: corsHeaders }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: corsHeaders }
    );
  }
}

// 删除 GitHub 文件
async function handleDeleteData() {
  try {
    const getResponse = await fetch(
      `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${DATA_FILE}`,
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );

    if (!getResponse.ok) {
      return new Response(
        JSON.stringify({ error: 'File not found' }),
        { status: 404, headers: corsHeaders }
      );
    }

    const fileData = await getResponse.json();
    const sha = fileData.sha;

    const deleteResponse = await fetch(
      `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${DATA_FILE}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: 'Reset data',
          sha: sha
        })
      }
    );

    if (!deleteResponse.ok) {
      throw new Error(`Failed to delete: ${deleteResponse.status}`);
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Data deleted' }),
      { headers: corsHeaders }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: corsHeaders }
    );
  }
}

// 主入口
export default {
  fetch(request) {
    return handleRequest(request);
  }
};
