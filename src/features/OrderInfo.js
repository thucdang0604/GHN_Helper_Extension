const OrderInfoFeature = {
    id: 'feature_orderInfo',
    uiInterval: null,
    isRunning: false,
    orderCache: {},

    injectInterceptor() {
        if (document.getElementById('ghn-inject-script')) return;
        const script = document.createElement('script');
        script.id = 'ghn-inject-script';
        script.src = chrome.runtime.getURL('inject.js');
        script.onload = function () { this.remove(); };
        (document.head || document.documentElement).appendChild(script);
    },

    setupApiListener() {
        this.apiListener = (e) => {
            const data = e.detail;
            let orders = [];
            if (Array.isArray(data)) orders = data;
            else if (data && data.data) orders = Array.isArray(data.data) ? data.data : [data.data];

            orders.forEach(order => {
                if (order && order.orderCode) {
                    this.orderCache[order.orderCode] = order.clientId || (order.sourceOps ? order.sourceOps.clientId : null);
                }
            });
        };
        window.addEventListener('GHN_API_DATA_EXT', this.apiListener);
    },

    injectSelectAllButton() {
        if (document.getElementById('ghn-select-all-btn')) return;

        // Tìm ô td cuối cùng trong thead (cột checkbox)
        const thead = document.querySelector('.table-order-from-sender thead');
        if (!thead) return;
        const headerRow = thead.querySelector('tr');
        if (!headerRow) return;
        const lastTd = headerRow.querySelector('td:last-child');
        if (!lastTd) return;

        const wrapper = document.createElement('div');
        wrapper.id = 'ghn-select-all-btn';
        wrapper.className = 'checkbox checkbox-replace checkbox-success ghn-injected-info';
        wrapper.title = 'Chọn / Bỏ chọn tất cả';
        wrapper.style.cssText = 'cursor: pointer; margin: 0;';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = 'ghn-select-all-cb';

        const lbl = document.createElement('label');
        lbl.setAttribute('for', 'ghn-select-all-cb');

        wrapper.appendChild(cb);
        wrapper.appendChild(lbl);

        cb.addEventListener('click', (e) => {
            e.stopPropagation();
            const shouldCheck = cb.checked;
            const allCheckboxes = document.querySelectorAll('input[type="checkbox"][name="orderCheckbox"]');

            allCheckboxes.forEach(box => {
                if (box.checked !== shouldCheck) {
                    box.click();
                }
            });
        });

        lastTd.appendChild(wrapper);
    },

    processUI() {
        if (!this.isRunning) return;

        // Inject nút "Chọn tất cả" nếu chưa có
        this.injectSelectAllButton();

        const rows = document.querySelectorAll('tr[data-order-code]:not(.ghn-processed-info)');

        rows.forEach(row => {
            const orderCode = row.getAttribute('data-order-code');
            if (!orderCode) return;

            // --- Kích thước (Cột 5) ---
            const weightCell = row.cells[4];
            if (weightCell && !weightCell.querySelector('.size-info')) {
                const l = document.getElementById(`length-${orderCode}`)?.value || "10";
                const w = document.getElementById(`width-${orderCode}`)?.value || "10";
                const h = document.getElementById(`height-${orderCode}`)?.value || "10";

                weightCell.insertAdjacentHTML('beforeend',
                    `<div class="size-info ghn-injected-info" style="color: #8c8c8c; font-size: 15px; font-weight: bold; margin-top: 2px;">Size: ${l}x${w}x${h}</div>`);
            }

            // --- Phân loại (Cột 3) ---
            const senderCell = row.cells[2];
            if (senderCell && !senderCell.querySelector('.order-type-label')) {
                const cId = String(this.orderCache[orderCode] || "");
                const senderName = senderCell.innerText || "";

                let labelText = "Shop";
                let labelColor = "#95a5a6";

                if (cId === "4389685") {
                    labelText = "Tiktok hoàn hàng"; labelColor = "#ff4d4f";
                } else if (cId === "224845") {
                    labelText = "Shopee hàng hoàn"; labelColor = "#ff851b";
                }

                senderCell.insertAdjacentHTML('beforeend',
                    `<div class="order-type-label ghn-injected-info" style="color: white; background: ${labelColor}; font-weight: bold; font-size: 11px; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-top: 4px;">${labelText}</div>`);
            }

            row.classList.add('ghn-processed-info');
        });
    },

    start() {
        this.isRunning = true;
        this.injectInterceptor();
        if (!this.apiListener) this.setupApiListener();
        if (!this.uiInterval) {
            this.uiInterval = setInterval(() => this.processUI(), 1000);
        }
        this.processUI();
    },

    stop() {
        this.isRunning = false;
        if (this.uiInterval) {
            clearInterval(this.uiInterval);
            this.uiInterval = null;
        }
        // Cleanup injected UI
        document.querySelectorAll('.ghn-injected-info').forEach(el => el.remove());
        document.querySelectorAll('.ghn-processed-info').forEach(el => el.classList.remove('ghn-processed-info'));
        // Note: We don't remove inject.js or apiListener because they don't affect UI and are harmless, 
        // but we could if strictly necessary.
    }
};

// Register module
if (window.GHNConfigManager) {
    window.GHNConfigManager.registerFeature(OrderInfoFeature.id, OrderInfoFeature);
}
