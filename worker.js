export default {
  async fetch(request, env) {
    const GITHUB_TOKEN = env.GITHUB_TOKEN;
    const GITHUB_OWNER = env.GITHUB_OWNER || 'tan20130420';
    const GITHUB_REPO = env.GITHUB_REPO || 'rent-manager';
    const DATA_FILE = 'data.json';
    const GITHUB_API = 'https://api.github.com';
    const RAW_URL = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/${DATA_FILE}`;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json; charset=utf-8'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // GET /api/data - 读取数据 (使用 raw.githubusercontent.com 直接下载，避免 base64 编码问题)
    if (request.method === 'GET' && url.pathname === '/api/data') {
      try {
        const response = await fetch(RAW_URL, {
          headers: { 'User-Agent': 'rent-manager-worker' }
        });

        if (response.status === 404) {
          return new Response(
            JSON.stringify({ rooms: [], tenants: [], bills: [], ledger: [], nid: { r: 10, t: 100, b: 100, l: 100 } }),
            { headers: corsHeaders }
          );
        }

        if (!response.ok) {
          throw new Error(`GitHub fetch error: ${response.status}`);
        }

        // raw.githubusercontent.com 直接返回文件内容，无需 base64 解码
        const text = await response.text();
        // 验证是否为有效 JSON
        const parsed = JSON.parse(text);
        return new Response(JSON.stringify(parsed), { headers: corsHeaders });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
      }
    }

    // POST /api/data - 保存数据到 GitHub
    if (request.method === 'POST' && url.pathname === '/api/data') {
      try {
        const newData = await request.json();

        let sha = null;
        const getResponse = await fetch(
          `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${DATA_FILE}`,
          {
            headers: {
              'Authorization': `token ${GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'rent-manager-worker'
            }
          }
        );

        if (getResponse.ok) {
          const fileData = await getResponse.json();
          sha = fileData.sha;
        }

        // 上传时使用 TextEncoder 保证 UTF-8 编码正确
        const jsonStr = JSON.stringify(newData);
        const uint8 = new TextEncoder().encode(jsonStr);
        const binString = Array.from(uint8, byte => String.fromCharCode(byte)).join('');
        const content = btoa(binString);

        const commitResponse = await fetch(
          `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${DATA_FILE}`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `token ${GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
              'User-Agent': 'rent-manager-worker'
            },
            body: JSON.stringify({
              message: `Auto sync data - ${new Date().toISOString()}`,
              content: content,
              sha: sha
            })
          }
        );

        if (!commitResponse.ok) {
          const errBody = await commitResponse.text();
          throw new Error(`Failed to commit: ${commitResponse.status} - ${errBody.substring(0,100)}`);
        }

        return new Response(JSON.stringify({ success: true, message: 'Data saved to GitHub' }), { headers: corsHeaders });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
      }
    }

    // DELETE /api/data
    if (request.method === 'DELETE' && url.pathname === '/api/data') {
      try {
        const getResponse = await fetch(
          `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${DATA_FILE}`,
          {
            headers: {
              'Authorization': `token ${GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'rent-manager-worker'
            }
          }
        );

        if (!getResponse.ok) {
          return new Response(JSON.stringify({ error: 'File not found' }), { status: 404, headers: corsHeaders });
        }

        const fileData = await getResponse.json();
        const deleteResponse = await fetch(
          `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${DATA_FILE}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `token ${GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
              'User-Agent': 'rent-manager-worker'
            },
            body: JSON.stringify({ message: 'Reset data', sha: fileData.sha })
          }
        );

        if (!deleteResponse.ok) {
          throw new Error(`Failed to delete: ${deleteResponse.status}`);
        }

        return new Response(JSON.stringify({ success: true, message: 'Data deleted' }), { headers: corsHeaders });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
      }
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: corsHeaders });
  }
};
