const TripPriceCollectorFeature = {
    id: 'feature_tripPriceCollector',
    isRunning: false,
    observer: null,
    urlCheckInterval: null,
    lastURL: null,
    collectTimer: null,

    GOOGLE_SCRIPT_WEBHOOK_URL: "https://script.google.com/macros/s/AKfycbzAXE76U7bljevf-lHH8v8a4gwRdmSf7JlokKF-0T1bSfyWCTRHEZhEPNrsZfI8IMWL/exec",

    lastScrapedFingerprint: '',
    isSending: false,

    // Kiểm tra có phải trang trip-detail không
    isTripDetailPage() {
        return (window.location.pathname || '').includes('/lastmile/trip-detail/');
    },

    // Lấy tripCode từ URL
    getTripCode() {
        const match = (window.location.pathname || '').match(/\/lastmile\/trip-detail\/([^/]+)/);
        return match ? match[1] : '';
    },

    // Parse số tiền từ text (VD: "28,600" → 28600, "2,430,000" → 2430000, "0" → 0)
    parseAmount(text) {
        if (!text) return 0;
        const cleaned = text.trim().replace(/[^\d]/g, '');
        const num = parseInt(cleaned, 10);
        return isNaN(num) ? 0 : num;
    },

    // Xác định index các cột từ thead (phòng hờ bảng thay đổi thứ tự cột)
    getColumnIndexes() {
        const headers = Array.from(document.querySelectorAll('.ant-table-thead th'));
        let orderCodeIdx = -1;
        let phaiThuIdx = -1;
        let gtbThuIdx = -1;

        headers.forEach((th, idx) => {
            const text = (th.textContent || '').trim().toLowerCase();
            if (text.includes('mã đơn') || text.includes('mã đơn hàng')) {
                orderCodeIdx = idx;
            } else if (text.includes('phải thu')) {
                phaiThuIdx = idx;
            } else if (text.includes('gtb-thu') || text.includes('gtb thu')) {
                gtbThuIdx = idx;
            }
        });

        return {
            orderCodeIdx: orderCodeIdx !== -1 ? orderCodeIdx : 2,
            phaiThuIdx: phaiThuIdx !== -1 ? phaiThuIdx : 5,
            gtbThuIdx: gtbThuIdx !== -1 ? gtbThuIdx : 6
        };
    },

    // Đọc tất cả đơn hàng từ bảng trên trang
    scrapeTableData() {
        const rows = document.querySelectorAll('.ant-table-tbody tr.ant-table-row');
        if (!rows || rows.length === 0) return [];

        const { orderCodeIdx, phaiThuIdx, gtbThuIdx } = this.getColumnIndexes();
        const records = [];
        const tripCode = this.getTripCode();

        rows.forEach(row => {
            const cells = row.querySelectorAll('td.ant-table-cell');
            if (cells.length <= Math.max(orderCodeIdx, phaiThuIdx, gtbThuIdx)) return;

            // Mã đơn hàng
            const orderCodeCell = cells[orderCodeIdx];
            const orderCodeEl = orderCodeCell.querySelector('[class*="orderCode"]') || orderCodeCell;
            const orderCode = orderCodeEl ? orderCodeEl.textContent.trim() : '';
            if (!orderCode) return;

            // Phải thu
            const phaiThu = this.parseAmount(cells[phaiThuIdx].textContent);

            // GTB-thu
            const gtbThu = this.parseAmount(cells[gtbThuIdx].textContent);

            records.push({
                action: 'UPDATE_PRICE',
                orderCode,
                phaiThu,
                gtbThu,
                tripCode
            });
        });

        return records;
    },

    // Gửi dữ liệu giá tiền qua background service worker
    sendPriceData(records, isManual = false) {
        if (!records || records.length === 0 || this.isSending) return;

        this.isSending = true;
        console.log(`💰 [GHN Trip Price] Đang gửi giá ${records.length} đơn sang Google Sheet...`, records);

        chrome.runtime.sendMessage({
            command: 'SEND_GOOGLE_SHEET_BATCH',
            url: this.GOOGLE_SCRIPT_WEBHOOK_URL,
            payload: records
        }, (res) => {
            this.isSending = false;
            if (res && res.status === 'ok') {
                console.log(`✅ [GHN Trip Price] Đã gửi thành công ${records.length} đơn!`, res.response);
                let message = `✅ Đã gửi giá ${records.length} đơn sang Google Sheet!`;
                try {
                    const parsed = JSON.parse(res.response);
                    if (parsed.updated !== undefined) {
                        message = `✅ Đã cập nhật giá ${parsed.updated}/${records.length} đơn!`;
                        if (parsed.notFound > 0) {
                            message += ` (${parsed.notFound} đơn chưa có trong Sheet)`;
                        }
                    }
                } catch (e) { }
                this.showToast(message, 'success');
            } else {
                console.error(`❌ [GHN Trip Price] Lỗi gửi giá:`, res?.error);
                this.showToast(`❌ Lỗi cập nhật giá: ${res?.error || 'Không rõ'}`, 'error');
            }
        });
    },

    // Thu thập và gửi giá tiền (gọi từ nút bấm thủ công hoặc tự động)
    collectAndSend(isManual = false) {
        if (!this.isTripDetailPage()) return;

        const records = this.scrapeTableData();
        if (records.length === 0) {
            if (isManual) {
                this.showToast('⚠️ Không tìm thấy đơn nào trên bảng!', 'info');
            }
            return;
        }

        this.showToast(`📥 Đang gửi giá ${records.length} đơn sang Google Sheet...`, 'info');
        this.sendPriceData(records, isManual);
    },

    // Kiểm tra và tự động gửi khi dữ liệu bảng thay đổi (load xong, chuyển trang, mở rộng hiển thị)
    checkAndAutoCollect() {
        if (!this.isTripDetailPage() || this.isSending) return;

        const rows = document.querySelectorAll('.ant-table-tbody tr.ant-table-row');
        if (rows.length === 0) return;

        const { orderCodeIdx } = this.getColumnIndexes();
        const firstCode = rows[0]?.querySelectorAll('td.ant-table-cell')[orderCodeIdx]?.textContent?.trim() || '';
        const lastCode = rows[rows.length - 1]?.querySelectorAll('td.ant-table-cell')[orderCodeIdx]?.textContent?.trim() || '';
        const currentFingerprint = `${rows.length}_${firstCode}_${lastCode}`;

        if (currentFingerprint !== this.lastScrapedFingerprint) {
            this.lastScrapedFingerprint = currentFingerprint;
            console.log(`💰 [GHN Trip Price] Phát hiện bảng thay đổi (${rows.length} đơn), tự động gửi...`);
            this.collectAndSend(false);
        }
    },

    // Toast thông báo
    showToast(message, type = 'info') {
        const existing = document.getElementById('ghn-trip-price-toast');
        if (existing) existing.remove();

        const colors = {
            info: '#1890ff',
            success: '#52c41a',
            error: '#ff4d4f'
        };

        const toast = document.createElement('div');
        toast.id = 'ghn-trip-price-toast';
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            background: ${colors[type] || colors.info};
            color: #fff;
            z-index: 999999;
            border-radius: 8px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.25);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 14px;
            font-weight: 600;
            max-width: 420px;
            transition: all 0.3s ease;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px)';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    },

    // Inject nút nổi "💰 Lấy giá tiền"
    injectUI() {
        if (!this.isRunning) return;

        // Nếu không phải trang trip-detail → gỡ bỏ UI
        if (!this.isTripDetailPage()) {
            const fab = document.getElementById('ghn-fab-trip-price');
            if (fab) fab.remove();
            return;
        }

        if (!document.body) return;

        // Thêm nút nổi
        if (!document.getElementById('ghn-fab-trip-price')) {
            const fab = document.createElement('button');
            fab.id = 'ghn-fab-trip-price';
            fab.type = 'button';
            fab.style.cssText = `
                position: fixed;
                bottom: 30px;
                right: 24px;
                background: linear-gradient(135deg, #FF9800, #F44336);
                color: #ffffff;
                border: none;
                border-radius: 8px;
                padding: 10px 20px;
                font-weight: 600;
                font-size: 14px;
                box-shadow: 0 4px 14px rgba(255, 152, 0, 0.4);
                cursor: pointer;
                z-index: 999990;
                display: flex;
                align-items: center;
                gap: 6px;
                transition: transform 0.2s, box-shadow 0.2s;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                outline: none;
            `;
            fab.innerHTML = `<span>💰 Lấy giá tiền</span>`;
            fab.title = 'Lấy giá tiền tất cả đơn trên bảng và cập nhật Google Sheet';
            fab.onmouseover = () => {
                fab.style.transform = 'translateY(-2px)';
                fab.style.boxShadow = '0 6px 20px rgba(255, 152, 0, 0.5)';
            };
            fab.onmouseout = () => {
                fab.style.transform = 'translateY(0)';
                fab.style.boxShadow = '0 4px 14px rgba(255, 152, 0, 0.4)';
            };
            fab.onclick = () => this.collectAndSend(true);

            document.body.appendChild(fab);
        }
    },

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.lastURL = location.href;
        this.lastScrapedFingerprint = '';

        this.injectUI();

        // Kiểm tra lấy giá ban đầu (đợi DOM render)
        if (this.isTripDetailPage()) {
            setTimeout(() => this.checkAndAutoCollect(), 1500);
            setTimeout(() => this.checkAndAutoCollect(), 3000);
        }

        // MutationObserver: detect khi bảng DOM thay đổi (load xong dữ liệu, chuyển trang, đổi page size)
        if (!this.observer) {
            let debounce;
            this.observer = new MutationObserver(() => {
                if (!this.isRunning || !this.isTripDetailPage()) return;
                clearTimeout(debounce);
                debounce = setTimeout(() => {
                    this.injectUI();
                    this.checkAndAutoCollect();
                }, 600);
            });
            if (document.body) {
                this.observer.observe(document.body, { childList: true, subtree: true });
            }
        }

        // Lắng nghe SPA navigation (từ inject.js)
        this.locationChangeListener = () => {
            if (!this.isRunning) return;
            const newURL = location.href;
            if (newURL === this.lastURL) return;
            this.lastURL = newURL;
            this.lastScrapedFingerprint = '';
            this.injectUI();
            if (this.isTripDetailPage()) {
                setTimeout(() => this.checkAndAutoCollect(), 1500);
            }
        };
        window.addEventListener('GHN_LOCATION_CHANGED', this.locationChangeListener);
        window.addEventListener('popstate', this.locationChangeListener);

        // Polling URL phòng hờ
        if (!this.urlCheckInterval) {
            this.urlCheckInterval = setInterval(() => {
                if (location.href !== this.lastURL) {
                    this.lastURL = location.href;
                    this.lastScrapedFingerprint = '';
                    if (this.isRunning) {
                        this.injectUI();
                        if (this.isTripDetailPage()) {
                            setTimeout(() => this.checkAndAutoCollect(), 1500);
                        }
                    }
                }
            }, 1000);
        }

        // Nếu DOM chưa tải xong
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                if (this.isRunning) {
                    this.injectUI();
                    if (this.isTripDetailPage()) {
                        setTimeout(() => this.checkAndAutoCollect(), 1500);
                    }
                }
            }, { once: true });
        }

        console.log("GHN Helper Pro: Trip Price Collector Started!");
    },

    stop() {
        this.isRunning = false;
        this.lastScrapedFingerprint = '';

        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }

        if (this.urlCheckInterval) {
            clearInterval(this.urlCheckInterval);
            this.urlCheckInterval = null;
        }

        if (this.collectTimer) {
            clearTimeout(this.collectTimer);
            this.collectTimer = null;
        }

        if (this.locationChangeListener) {
            window.removeEventListener('GHN_LOCATION_CHANGED', this.locationChangeListener);
            window.removeEventListener('popstate', this.locationChangeListener);
            this.locationChangeListener = null;
        }

        const fab = document.getElementById('ghn-fab-trip-price');
        if (fab) fab.remove();

        const toast = document.getElementById('ghn-trip-price-toast');
        if (toast) toast.remove();

        console.log("GHN Helper Pro: Trip Price Collector Stopped!");
    }
};

// Đăng ký module
if (window.GHNConfigManager) {
    window.GHNConfigManager.registerFeature(TripPriceCollectorFeature.id, TripPriceCollectorFeature);
}
