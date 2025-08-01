// script.js
// Front‑end logic to call the /api/test endpoint and display results.

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('test-form');
  const urlsInput = document.getElementById('urls');
  const resultsBody = document.querySelector('#results tbody');
  const ipSpan = document.getElementById('ip');
  const locationSpan = document.getElementById('location');
  const riskSpan = document.getElementById('risk');

  async function fetchIPInfo() {
    try {
      const res = await fetch('/api/ipinfo');
      const data = await res.json();
      ipSpan.innerText = data.ip || '未知';
      const geo = data.location;
      let locText = '未知';
      if (geo) {
        const parts = [];
        if (geo.country) parts.push(geo.country);
        if (geo.region) parts.push(geo.region);
        if (geo.city) parts.push(geo.city);
        locText = parts.join(' ');
      }
      locationSpan.innerText = locText || '未知';
      riskSpan.innerText = data.risk || '未知';
    } catch (e) {
      ipSpan.innerText = '错误';
      locationSpan.innerText = '错误';
      riskSpan.innerText = '错误';
    }
  }

  fetchIPInfo();

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
});