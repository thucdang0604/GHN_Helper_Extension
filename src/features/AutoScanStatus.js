const AutoScanStatusFeature = {
    id: 'feature_autoScanStatus',
    isRunning: false,
    isScanning: false,
    shouldStop: false,
    observer: null,
    urlCheckInterval: null,
    lastURL: null,

    CONFIG: {
        defaultDelay: 500, // ms
        defaultStatuses: ['ĐH Đang Giao', 'ĐH Đang Trả', 'ĐH Chờ Trả'],
        selectors: {
            statusTitle: '[class*="viewTitle"], [class*="_viewTitle_"]',
            orderItem: '[class*="itemOrder"], [class*="_itemOrder_"]',
            activeOrder: '[class*="itemOrder__active"], [class*="_itemOrder__active_"], [class*="active"]',
            inputField: '#orderCode, #form-input-order-code_orderCode, input[placeholder*="Quét mã" i]',
            form: 'form.ant-form'
        }
    },

    isTargetPage() {
        const href = (window.location.href || '').toLowerCase();
        const pathname = (window.location.pathname || '').toLowerCase();
        return href.includes('check-scan') || pathname.includes('check-scan');
    },

    // Hiển thị thông báo Toast
    showAlert(message, type = 'info') {
        const existing = document.getElementById('ghn-scan-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'ghn-scan-toast';
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            background: ${type === 'error' ? '#ff4d4f' : type === 'success' ? '#52c41a' : '#1890ff'};
            color: #fff;
            z-index: 999999;
            border-radius: 6px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.25);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            font-size: 14px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
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

    // Tìm các phần tử nhóm trạng thái
    getStatusSections() {
        let titles = Array.from(document.querySelectorAll(this.CONFIG.selectors.statusTitle));
        if (titles.length === 0) {
            titles = Array.from(document.querySelectorAll('div, span, p, h3, h4')).filter(el => {
                const t = el.innerText?.trim() || '';
                return (t.startsWith('ĐH ') || t.includes('Chờ Trả') || t.includes('Đang Giao') || t.includes('Đang Trả')) && el.children.length <= 2 && t.length < 50;
            });
        }
        return titles;
    },

    // Đọc danh sách trạng thái kèm số lượng đơn chưa quét
    getStatusData() {
        const sections = this.getStatusSections();
        const statusMap = [];

        sections.forEach(section => {
            const fullTitle = section.innerText.trim();
            // Tách tên trạng thái (bỏ phần đếm số lượng "0 / 23" phía sau nếu có)
            const cleanTitle = fullTitle.split(':')[0].trim();
            if (!cleanTitle) return;

            // Tìm container chứa danh sách đơn
            const container = section.closest('[class*="group"], [class*="section"], [class*="wrapper"], [class*="card"]') || section.parentElement;
            let unScannedCodes = [];
            let totalCodes = [];

            if (container) {
                const allItems = Array.from(container.querySelectorAll(this.CONFIG.selectors.orderItem));
                allItems.forEach(item => {
                    const code = item.innerText?.trim();
                    if (!code) return;
                    totalCodes.push(code);

                    const isActive = item.className.includes('active') || item.className.includes('checked') || item.className.includes('success');
                    if (!isActive) {
                        unScannedCodes.push(code);
                    }
                });
            }

            statusMap.push({
                fullTitle: fullTitle,
                name: cleanTitle,
                total: totalCodes.length,
                pending: unScannedCodes.length,
                pendingCodes: unScannedCodes,
                sectionElement: section
            });
        });

        return statusMap;
    },

    // Tạo thanh tiến trình nổi khi đang quét
    createProgressBar() {
        let bar = document.getElementById('ghn-scan-progress-bar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'ghn-scan-progress-bar';
            bar.style.cssText = `
                position: fixed;
                bottom: 30px;
                right: 30px;
                background: #ffffff;
                border-radius: 10px;
                padding: 16px 20px;
                box-shadow: 0 6px 25px rgba(0,0,0,0.25);
                z-index: 999998;
                width: 320px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                border-left: 5px solid #F26522;
            `;
            document.body.appendChild(bar);
        }
        return bar;
    },

    updateProgress(current, total, currentCode) {
        const bar = this.createProgressBar();
        const percent = Math.round((current / total) * 100);
        bar.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <span style="font-weight:700; font-size:14px; color:#333;">⚡ Đang quét tự động</span>
                <span style="font-size:13px; font-weight:700; color:#F26522;">${current} / ${total} (${percent}%)</span>
            </div>
            <div style="background:#f0f0f0; border-radius:6px; height:8px; width:100%; overflow:hidden; margin-bottom:10px;">
                <div style="background:linear-gradient(90deg, #F26522, #ff8c52); width:${percent}%; height:100%; transition: width 0.2s ease;"></div>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:12px; color:#666;">Mã: <b style="color:#1890ff;">${currentCode || '...'}</b></span>
                <button id="ghn-btn-stop-scan" style="background:#ff4d4f; color:#fff; border:none; border-radius:8px; padding:6px 14px; font-size:13px; cursor:pointer; font-weight:500; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; transition:all 0.2s;">⏹ Dừng lại</button>
            </div>
        `;

        const stopBtn = bar.querySelector('#ghn-btn-stop-scan');
        if (stopBtn) {
            stopBtn.onclick = () => {
                this.shouldStop = true;
                stopBtn.textContent = 'Đang dừng...';
                stopBtn.disabled = true;
            };
        }
    },

    removeProgressBar() {
        const bar = document.getElementById('ghn-scan-progress-bar');
        if (bar) bar.remove();
    },

    // Nhập và submit 1 mã đơn hàng
    async scanSingleOrder(code) {
        const input = document.querySelector(this.CONFIG.selectors.inputField);
        if (!input) {
            console.error("GHN Helper Pro: Không tìm thấy ô nhập #orderCode");
            return false;
        }

        input.focus();

        // 1. Dùng prototype setter để kích hoạt state của React
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (nativeInputValueSetter) {
            nativeInputValueSetter.call(input, code);
        } else {
            input.value = code;
        }

        if (input._valueTracker) {
            input._valueTracker.setValue('');
        }

        // 2. Dispatch events
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        await new Promise(r => setTimeout(r, 100));

        // 3. Submit form (qua submit button hoặc form submit event)
        const form = input.closest('form');
        let submitted = false;

        if (form) {
            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.click();
                submitted = true;
            } else {
                form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                submitted = true;
            }
        }

        // 4. Dispatch phím Enter
        input.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
        }));

        return true;
    },

    // Bắt đầu quy trình quét hàng loạt
    async startBatchScan(selectedStatuses, customDelay = 500) {
        if (this.isScanning) {
            this.showAlert("Đang có tiến trình quét đang chạy!", "error");
            return;
        }

        const statusData = this.getStatusData();
        const ordersToScan = [];

        statusData.forEach(item => {
            if (selectedStatuses.includes(item.name) || selectedStatuses.includes(item.fullTitle)) {
                item.pendingCodes.forEach(code => {
                    if (!ordersToScan.includes(code)) {
                        ordersToScan.push(code);
                    }
                });
            }
        });

        if (ordersToScan.length === 0) {
            this.showAlert("Không có mã đơn nào chưa quét trong các trạng thái đã chọn!", "error");
            return;
        }

        this.isScanning = true;
        this.shouldStop = false;

        this.showAlert(`🚀 Bắt đầu quét ${ordersToScan.length} mã đơn...`, "info");
        this.updateProgress(0, ordersToScan.length, ordersToScan[0]);

        let successCount = 0;

        for (let i = 0; i < ordersToScan.length; i++) {
            if (this.shouldStop || !this.isRunning) {
                this.showAlert(`🛑 Đã dừng quét! Đã hoàn thành ${successCount}/${ordersToScan.length} đơn.`, "info");
                break;
            }

            const code = ordersToScan[i];
            this.updateProgress(i + 1, ordersToScan.length, code);

            try {
                await this.scanSingleOrder(code);
                successCount++;
            } catch (err) {
                console.error(`GHN Helper Pro: Lỗi quét mã ${code}:`, err);
            }

            if (i < ordersToScan.length - 1) {
                await new Promise(r => setTimeout(r, customDelay));
            }
        }

        this.isScanning = false;
        this.removeProgressBar();

        if (successCount === ordersToScan.length && !this.shouldStop) {
            this.showAlert(`🎉 Hoàn tất quét toàn bộ ${successCount} đơn hàng!`, "success");
            try {
                const soundUrl = chrome.runtime.getURL('assets/sounds/success.mp3');
                new Audio(soundUrl).play().catch(() => {});
            } catch (e) {}
        }
    },

    // Hiển thị Modal Popup chọn trạng thái
    openStatusModal() {
        const existing = document.getElementById('ghn-auto-scan-modal');
        if (existing) existing.remove();

        const statusData = this.getStatusData();
        if (statusData.length === 0) {
            this.showAlert("Không tìm thấy danh sách đơn hàng nào trên trang!", "error");
            return;
        }

        const modal = document.createElement('div');
        modal.id = 'ghn-auto-scan-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.5);
            z-index: 999997;
            display: flex;
            justify-content: center;
            align-items: center;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        `;

        const listItemsHTML = statusData.map(item => {
            const isDefault = this.CONFIG.defaultStatuses.some(ds => item.name.includes(ds) || ds.includes(item.name));
            const hasPending = item.pending > 0;
            return `
                <label style="display:flex; align-items:center; justify-content:space-between; padding:8px 10px; margin-bottom:6px; background:#f9fbfd; border:1px solid #e8e8e8; border-radius:6px; cursor:pointer; transition:all 0.2s;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <input type="checkbox" name="ghn-status" value="${encodeURIComponent(item.name)}" ${isDefault && hasPending ? 'checked' : ''} style="width:16px; height:16px; cursor:pointer; accent-color:#F26522;">
                        <span style="font-size:14px; font-weight:600; color:#333;">${item.name}</span>
                    </div>
                    <div style="font-size:12px;">
                        <span style="background:${hasPending ? '#fff1e6' : '#f0f0f0'}; color:${hasPending ? '#F26522' : '#999'}; padding:2px 8px; border-radius:10px; font-weight:600;">
                            ${item.pending} / ${item.total} chưa quét
                        </span>
                    </div>
                </label>
            `;
        }).join('');

        modal.innerHTML = `
            <div style="background:#ffffff; border-radius:12px; width:420px; max-width:92vw; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 12px 35px rgba(0,0,0,0.3); overflow:hidden; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                <!-- Header -->
                <div style="padding:16px 20px; background:#FF5500; color:#fff; display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:18px;">⚡</span>
                        <h3 style="margin:0; font-size:16px; font-weight:600; color:#fff;">Quét Tự Động Theo Trạng Thái</h3>
                    </div>
                    <button id="ghn-modal-close" style="background:transparent; border:none; color:#fff; font-size:22px; cursor:pointer; line-height:1;">&times;</button>
                </div>

                <!-- Body -->
                <div style="padding:16px 20px; overflow-y:auto; flex:1;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                        <span style="font-size:13px; color:#666;">Chọn nhóm cần nhập tự động:</span>
                        <div style="display:flex; gap:6px;">
                            <button id="ghn-btn-select-all" style="font-size:12px; padding:3px 8px; border:1px solid #d9d9d9; border-radius:6px; background:#fafafa; cursor:pointer; font-weight:500;">Tất cả</button>
                            <button id="ghn-btn-deselect-all" style="font-size:12px; padding:3px 8px; border:1px solid #d9d9d9; border-radius:6px; background:#fafafa; cursor:pointer; font-weight:500;">Bỏ chọn</button>
                            <button id="ghn-btn-select-default" style="font-size:12px; padding:3px 8px; border:1px solid #FF5500; color:#FF5500; border-radius:6px; background:#fff7f2; cursor:pointer; font-weight:500;">Mặc định</button>
                        </div>
                    </div>

                    <div id="ghn-status-checkbox-list" style="margin-bottom:14px; max-height:220px; overflow-y:auto;">
                        ${listItemsHTML}
                    </div>

                    <!-- Config delay -->
                    <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:#f5f7fa; border-radius:8px; margin-bottom:6px;">
                        <span style="font-size:13px; color:#444; font-weight:500;">Tốc độ quét (Delay mỗi đơn):</span>
                        <div style="display:flex; align-items:center; gap:4px;">
                            <input type="number" id="ghn-scan-delay" value="${this.CONFIG.defaultDelay}" min="200" max="3000" step="50" style="width:65px; padding:4px 6px; border:1px solid #d9d9d9; border-radius:6px; text-align:center; font-size:13px; font-weight:600;">
                            <span style="font-size:12px; color:#888;">ms</span>
                        </div>
                    </div>
                </div>

                <!-- Footer -->
                <div style="padding:12px 20px; background:#fafafa; border-top:1px solid #eee; display:flex; gap:10px;">
                    <button id="ghn-btn-start-scan" style="flex:1; background:#FF5500; color:#fff; border:none; padding:10px 18px; border-radius:8px; font-weight:500; font-size:14px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; box-shadow:0 2px 6px rgba(255, 85, 0, 0.25); transition:all 0.2s;">
                        <span>🚀 Bắt đầu quét</span>
                    </button>
                    <button id="ghn-btn-cancel-modal" style="background:#e8e8e8; color:#333; border:none; padding:10px 18px; border-radius:8px; font-size:14px; cursor:pointer; font-weight:500; transition:all 0.2s;">
                        Đóng
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Quick select buttons
        const checkboxes = modal.querySelectorAll('input[name="ghn-status"]');
        modal.querySelector('#ghn-btn-select-all').onclick = () => checkboxes.forEach(cb => cb.checked = true);
        modal.querySelector('#ghn-btn-deselect-all').onclick = () => checkboxes.forEach(cb => cb.checked = false);
        modal.querySelector('#ghn-btn-select-default').onclick = () => {
            checkboxes.forEach(cb => {
                const val = decodeURIComponent(cb.value);
                cb.checked = this.CONFIG.defaultStatuses.some(ds => val.includes(ds) || ds.includes(val));
            });
        };

        // Close handlers
        const closeModal = () => modal.remove();
        modal.querySelector('#ghn-modal-close').onclick = closeModal;
        modal.querySelector('#ghn-btn-cancel-modal').onclick = closeModal;
        modal.onclick = (e) => { if (e.target === modal) closeModal(); };

        // Start scan handler
        modal.querySelector('#ghn-btn-start-scan').onclick = () => {
            const selected = Array.from(modal.querySelectorAll('input[name="ghn-status"]:checked')).map(cb => decodeURIComponent(cb.value));
            const delay = parseInt(modal.querySelector('#ghn-scan-delay').value, 10) || this.CONFIG.defaultDelay;

            if (selected.length === 0) {
                this.showAlert("Vui lòng chọn ít nhất 1 trạng thái để quét!", "error");
                return;
            }

            closeModal();
            this.startBatchScan(selected, delay);
        };
    },

    // Inject nút bấm vào giao diện (Chỉ giữ duy nhất 1 nút nổi Quét Theo Trạng Thái)
    injectUI() {
        if (!this.isRunning) return;

        // Nếu không phải trang mục tiêu, gỡ bỏ UI nếu đang tồn tại
        if (!this.isTargetPage()) {
            const existingFab = document.getElementById('ghn-fab-auto-scan');
            if (existingFab) existingFab.remove();
            const existingModal = document.getElementById('ghn-auto-scan-modal');
            if (existingModal) existingModal.remove();
            const oldToolbarBtn = document.getElementById('ghn-btn-auto-scan-toolbar');
            if (oldToolbarBtn) oldToolbarBtn.remove();
            return;
        }

        // Đợi DOM body sẵn sàng
        if (!document.body) return;

        // Xóa nút toolbar cũ nếu còn tồn tại
        const oldToolbarBtn = document.getElementById('ghn-btn-auto-scan-toolbar');
        if (oldToolbarBtn) oldToolbarBtn.remove();

        // Thêm Floating Action Button duy nhất (Nút nổi góc phải 'Quét Theo Trạng Thái')
        if (!document.getElementById('ghn-fab-auto-scan')) {
            const fab = document.createElement('button');
            fab.id = 'ghn-fab-auto-scan';
            fab.type = 'button';
            fab.style.cssText = `
                position: fixed;
                bottom: 80px;
                right: 24px;
                background: #FF5500;
                color: #ffffff;
                border: none;
                border-radius: 8px;
                padding: 10px 20px;
                font-weight: 500;
                font-size: 14px;
                box-shadow: 0 4px 14px rgba(255, 85, 0, 0.35);
                cursor: pointer;
                z-index: 999990;
                display: flex;
                align-items: center;
                gap: 6px;
                transition: transform 0.2s, background-color 0.2s, box-shadow 0.2s;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                outline: none;
            `;
            fab.innerHTML = `<span>⚡ Quét theo trạng thái</span>`;
            fab.title = "Mở bảng quét mã đơn tự động theo trạng thái (Alt + S)";
            fab.onmouseover = () => { 
                fab.style.backgroundColor = '#e04800';
                fab.style.transform = 'translateY(-2px)';
            };
            fab.onmouseout = () => { 
                fab.style.backgroundColor = '#FF5500';
                fab.style.transform = 'translateY(0)';
            };
            fab.onclick = () => this.openStatusModal();

            document.body.appendChild(fab);
        }
    },

    // Phím tắt Alt + S
    setupKeyboardShortcut() {
        if (this.keyListener) return;
        this.keyListener = (e) => {
            if (!this.isRunning || !this.isTargetPage()) return;
            if (e.altKey && (e.key === 's' || e.key === 'S')) {
                e.preventDefault();
                this.openStatusModal();
            }
        };
        window.addEventListener('keydown', this.keyListener);
    },

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.lastURL = location.href;

        this.injectUI();
        this.setupKeyboardShortcut();

        // 1. MutationObserver quan sát DOM để inject UI ngay khi trang check-scan render xong
        if (!this.observer) {
            let timeout;
            this.observer = new MutationObserver(() => {
                if (!this.isRunning) return;
                clearTimeout(timeout);
                timeout = setTimeout(() => this.injectUI(), 200);
            });
            const targetNode = document.body;
            if (!targetNode) {
                console.warn('GHN Helper Pro: [AutoScanStatus] document.body chưa sẵn sàng, hoãn observe.');
            } else {
                this.observer.observe(targetNode, { childList: true, subtree: true });
            }
        }

        // 2. Lắng nghe sự kiện chuyển trang SPA (từ inject.js hoặc popstate / hashchange)
        this.locationChangeListener = () => {
            if (!this.isRunning) return;
            this.lastURL = location.href;
            this.injectUI();
            setTimeout(() => this.injectUI(), 300);
        };
        window.addEventListener('GHN_LOCATION_CHANGED', this.locationChangeListener);
        window.addEventListener('popstate', this.locationChangeListener);
        window.addEventListener('hashchange', this.locationChangeListener);

        // 3. Polling URL định kỳ phòng hờ
        if (!this.urlCheckInterval) {
            this.urlCheckInterval = setInterval(() => {
                if (location.href !== this.lastURL) {
                    this.lastURL = location.href;
                    if (this.isRunning) {
                        this.injectUI();
                    }
                }
            }, 500);
        }

        // 4. Nếu DOM chưa tải xong lúc start, đợi DOMContentLoaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                if (this.isRunning) {
                    this.injectUI();
                }
            }, { once: true });
        }

        console.log("GHN Helper Pro: Auto Scan Status Feature Started!");
    },

    stop() {
        this.isRunning = false;
        this.isScanning = false;
        this.shouldStop = true;

        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }

        if (this.urlCheckInterval) {
            clearInterval(this.urlCheckInterval);
            this.urlCheckInterval = null;
        }

        if (this.keyListener) {
            window.removeEventListener('keydown', this.keyListener);
            this.keyListener = null;
        }

        if (this.locationChangeListener) {
            window.removeEventListener('GHN_LOCATION_CHANGED', this.locationChangeListener);
            window.removeEventListener('popstate', this.locationChangeListener);
            window.removeEventListener('hashchange', this.locationChangeListener);
            this.locationChangeListener = null;
        }

        // Cleanup UI
        const toolbarBtn = document.getElementById('ghn-btn-auto-scan-toolbar');
        if (toolbarBtn) toolbarBtn.remove();

        const fab = document.getElementById('ghn-fab-auto-scan');
        if (fab) fab.remove();

        const modal = document.getElementById('ghn-auto-scan-modal');
        if (modal) modal.remove();

        this.removeProgressBar();

        console.log("GHN Helper Pro: Auto Scan Status Feature Stopped!");
    }
};

// Đăng ký module với GHNConfigManager
if (window.GHNConfigManager) {
    window.GHNConfigManager.registerFeature(AutoScanStatusFeature.id, AutoScanStatusFeature);
}
