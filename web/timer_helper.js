function startCountdown(endTime, elements, isMini = false) {
    if (!elements) return;
    const targets = Array.isArray(elements) ? elements : [elements];

    function update() {
        const now = Math.floor(Date.now() / 1000);
        const diff = endTime - now;

        if (diff <= 0) {
            targets.forEach(el => {
                el.innerHTML = `<span style="color:#FF3B30; font-weight:800;">EXPIRED</span>`;
            });
            return false;
        }

        const d = Math.floor(diff / 86400);
        const h = Math.floor((diff % 86400) / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;

        const endDate = new Date(endTime * 1000);
        const dateStr = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const pad = (n) => n.toString().padStart(2, '0');

        if (isMini) {
            // For mini timers on cards: JUST "14d 9h"
            let display;
            if (d > 0) display = `${d}d ${h}h`;
            else if (h > 0) display = `${h}h ${m}m`;
            else display = `${m}m`;
            targets.forEach(el => el.innerText = display);
        } else {
            // For product view timer: Simplified Horizontal Box
            const html = `
                <div class="market-timer-box">
                    <span class="mt-box-label">Ends in</span>
                    <span class="mt-box-val">${d}d : ${pad(h)} : ${pad(m)} : ${pad(s)}</span>
                    <span class="mt-box-date">${dateStr}</span>
                </div>
            `;
            targets.forEach(el => el.innerHTML = html);
        }
        return true;
    }

    if (update()) {
        const interval = setInterval(() => {
            if (!update()) clearInterval(interval);
        }, 1000);
    }
}
