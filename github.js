const API = 'https://api.github.com';

function headers(token) {
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

export async function getFile({ owner, repo, path, branch, token }) {
  const url = `${API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`;
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) throw new Error((await res.json()).message || res.statusText);
  const data = await res.json();
  return { content: decodeBase64(data.content), sha: data.sha };
}

export async function putFile({ owner, repo, path, branch, token, content, sha, message }) {
  const url = `${API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  const body = {
    message: message || `Update ${path} via OpenCanvas Studio`,
    content: encodeBase64(content),
    branch
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error((await res.json()).message || res.statusText);
  return res.json();
}

export async function deleteFile({ owner, repo, path, branch, token, sha, message }) {
  const url = `${API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: message || `Delete ${path} via OpenCanvas Studio`,
      sha,
      branch
    })
  });
  if (!res.ok) throw new Error((await res.json()).message || res.statusText);
  return res.json();
}

export async function listTree({ owner, repo, branch, token }) {
  const url = `${API}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) throw new Error((await res.json()).message || res.statusText);
  const data = await res.json();
  return data.tree.filter((n) => n.type === 'blob');
}

export async function getRepo({ owner, repo, token }) {
  const res = await fetch(`${API}/repos/${owner}/${repo}`, { headers: headers(token) });
  if (!res.ok) throw new Error((await res.json()).message || res.statusText);
  return res.json();
}

function decodeBase64(b64) {
  const bin = atob(b64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function encodeBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}
