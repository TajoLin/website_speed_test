// script.js
// Front‑end logic to call the /api/test endpoint and display results.

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('test-form');
  const urlsInput = document.getElementById('urls');
  const resultsBody = document.querySelector('#results tbody');
  const ipForm = document.getElementById('ip-form');
  const ipInput = document.getElementById('ip');
  const ipBody = document.querySelector('#ip-result tbody');

  /**
   * Runs tests on each URL sequentially so as not to overload the server.
   * For each URL a row is created in the results table.  The API returns
   * either timing data or an error message.
   *
   * @param {string[]} urls List of URLs (without protocol)
   */
  async function runTests(urls) {
    resultsBody.innerHTML = '';
    for (const url of urls) {
      const row = document.createElement('tr');
      // Initialize row cells
      row.innerHTML = `
        <td>${url}</td>
        <td>测试中...</td>
        <td></td>
        <td></td>
      `;
      resultsBody.appendChild(row);
      try {
        const response = await fetch(`/api/test?url=${encodeURIComponent(url)}`);
        const data = await response.json();
        if (data.error) {
          row.cells[1].innerText = '错误';
          row.cells[2].innerText = data.error;
          row.cells[3].innerText = '';
        } else {
          row.cells[1].innerText = data.ttfb !== null ? data.ttfb : '无';
          row.cells[2].innerText = data.total;
          row.cells[3].innerText = data.bytes;
        }
      } catch (err) {
        row.cells[1].innerText = '错误';
        row.cells[2].innerText = err.message;
        row.cells[3].innerText = '';
      }
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const raw = urlsInput.value.trim();
    if (!raw) return;
    const urls = raw.split(',').map((u) => u.trim()).filter(Boolean);
    runTests(urls);
  });

  async function queryIp(ip) {
    ipBody.innerHTML = '';
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${ip}</td>
      <td colspan="4">查询中...</td>
    `;
    ipBody.appendChild(row);
    try {
      const response = await fetch(`/api/ipinfo?ip=${encodeURIComponent(ip)}`);
      const data = await response.json();
      if (data.error) {
        row.innerHTML = `<td>${ip}</td><td colspan="4">${data.error}</td>`;
      } else {
        row.innerHTML = `
          <td>${ip}</td>
          <td>${data.country || ''}</td>
          <td>${data.regionName || ''}</td>
          <td>${data.city || ''}</td>
          <td>${data.isp || ''}</td>
        `;
      }
    } catch (err) {
      row.innerHTML = `<td>${ip}</td><td colspan="4">${err.message}</td>`;
    }
  }

  ipForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const ip = ipInput.value.trim();
    if (!ip) return;
    queryIp(ip);
  });
});