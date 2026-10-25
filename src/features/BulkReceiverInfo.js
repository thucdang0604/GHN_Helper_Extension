// src/features/BulkReceiverInfo.js
// Tính năng tra cứu thông tin Tên & SĐT hàng loạt từ API GHN và đồng bộ vào Google Sheet

const BulkReceiverInfoFeature = {
    id: 'feature_bulkReceiverInfo',
    isRunning: false,
    isProcessing: false,
    shouldStop: false,
    capturedAuth: null,
    capturedWarehouseId: '20747000',

    CONFIG: {
        apiUrl: 'https://nhanh-api.ghn.vn/api/lastmile/order/search/receiver-info',
        defaultWebhookUrl: 'https://script.google.com/macros/s/AKfycbzAXE76U7bljevf-lHH8v8a4gwRdmSf7JlokKF-0T1bSfyWCTRHEZhEPNrsZfI8IMWL/exec',
        defaultDelay: 400, // ms giữa các request
        batchSyncSize: 25  // Tự động gửi lên Sheet mỗi 25 đơn (tối ưu mẻ lớn cực nhanh)
    },

    state: {
        orderList: [],
        results: [],
        currentIndex: 0,
        successCount: 0,
        failCount: 0,
        syncedCount: 0
    },

    // Kiểm tra có phải trang GHN không
    isTargetPage() {
        const host = (window.location.hostname || '').toLowerCase();
        return host.includes('ghn.vn');
    },

    // Quét tìm chuỗi JWT (bắt đầu bằng eyJ...) trong storage hoặc cookie
    scanStorageForJwt() {
        // 1. Quét localStorage
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                const v = localStorage.getItem(k);
                if (!v) continue;
                const match = v.match(/eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/);
                if (match) return `Bearer ${match[0]}`;
            }
        } catch (e) {}

        // 2. Quét sessionStorage
        try {
            for (let i = 0; i < sessionStorage.length; i++) {
                const k = sessionStorage.key(i);
                const v = sessionStorage.getItem(k);
                if (!v) continue;
                const match = v.match(/eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/);
                if (match) return `Bearer ${match[0]}`;
            }
        } catch (e) {}

        // 3. Quét cookie
        try {
            const cookieMatch = document.cookie.match(/eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/);
            if (cookieMatch) return `Bearer ${cookieMatch[0]}`;
        } catch (e) {}

        return null;
    },

    // Lấy Authorization Header (Bearer ...) từ nhiều nguồn
    getAuthHeader() {
        // 1. Từ ô input thủ công trên Modal nếu người dùng đã nhập
        const inputAuth = document.getElementById('ghn-receiver-auth-input');
        if (inputAuth && inputAuth.value.trim()) {
            const val = inputAuth.value.trim();
            return val.startsWith('Bearer ') ? val : `Bearer ${val}`;
        }

        // 2. Từ giá trị đã bắt được qua postMessage/event
        if (this.capturedAuth) return this.capturedAuth;

        // 3. Quét trực tiếp các storage và cookie
        const scanned = this.scanStorageForJwt();
        if (scanned) {
            this.capturedAuth = scanned;
            return scanned;
        }

        return null;
    },

    // Lấy Warehouse ID
    getWarehouseId() {
        const inputWId = document.getElementById('ghn-receiver-warehouse-id');
        if (inputWId && inputWId.value.trim()) {
            return inputWId.value.trim();
        }
        if (this.capturedWarehouseId) return this.capturedWarehouseId;

        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k.toLowerCase().includes('warehouse') || k.toLowerCase().includes('hub')) {
                    const v = localStorage.getItem(k);
                    if (v) {
                        try {
                            const parsed = JSON.parse(v);
                            const w = parsed.warehouseId || parsed.warehouse_id || parsed.id;
                            if (w) return String(w);
                        } catch (e) {
                            if (/^\d{5,10}$/.test(v.trim())) return v.trim();
                        }
                    }
                }
            }
        } catch (e) {}

        return '20747000';
    },

    // Gửi yêu cầu xin Token tới inject.js
    requestTokenFromPage() {
        window.postMessage({ type: 'GHN_REQUEST_AUTH_TOKEN' }, '*');
    },

    // Hiển thị Toast thông báo nhanh
    showToast(message, type = 'info') {
        const existing = document.getElementById('ghn-receiver-toast');
        if (existing) existing.remove();

        const colors = {
            info: '#1890ff',
            success: '#52c41a',
            error: '#ff4d4f',
            warning: '#faad14'
        };

        const toast = document.createElement('div');
        toast.id = 'ghn-receiver-toast';
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            background: ${colors[type] || colors.info};
            color: #fff;
            z-index: 9999999;
            border-radius: 8px;
            box-shadow: 0 6px 20px rgba(0,0,0,0.25);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 14px;
            font-weight: 600;
            max-width: 450px;
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

    // Inject nút nổi mở công cụ trên trang web GHN
    injectFloatingButton() {
        if (!this.isRunning || !this.isTargetPage()) return;
        if (document.getElementById('ghn-fab-bulk-receiver')) return;
        if (!document.body) return;

        const fab = document.createElement('button');
        fab.id = 'ghn-fab-bulk-receiver';
        fab.type = 'button';
        fab.title = 'Tra Cứu Thông Tin Vận Đơn & Địa Chỉ Hàng Loạt';
        fab.style.cssText = `
            position: fixed;
            bottom: 30px;
            left: 24px;
            background: linear-gradient(135deg, #F26522, #FF8C00);
            color: #ffffff;
            border: none;
            border-radius: 8px;
            padding: 10px 18px;
            font-weight: 600;
            font-size: 14px;
            box-shadow: 0 4px 14px rgba(242, 101, 34, 0.4);
            cursor: pointer;
            z-index: 999990;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: transform 0.2s, box-shadow 0.2s;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            outline: none;
        `;
        fab.innerHTML = `<span>📦 Tra Cứu Đơn & Địa Chỉ</span>`;

        fab.onmouseover = () => {
            fab.style.transform = 'translateY(-2px)';
            fab.style.boxShadow = '0 6px 20px rgba(242, 101, 34, 0.55)';
        };
        fab.onmouseout = () => {
            fab.style.transform = 'translateY(0)';
            fab.style.boxShadow = '0 4px 14px rgba(242, 101, 34, 0.4)';
        };
        fab.onclick = () => this.openModal();

        document.body.appendChild(fab);
    },

    // Cập nhật trạng thái hiển thị của Auth trên Modal
    updateAuthStatusUI() {
        const badge = document.getElementById('ghn-receiver-auth-badge');
        const authInput = document.getElementById('ghn-receiver-auth-input');
        const auth = this.getAuthHeader();
        const warehouseId = this.getWarehouseId();

        if (badge) {
            if (auth) {
                const shortToken = auth.length > 25 ? `${auth.substring(0, 18)}...${auth.substring(auth.length - 8)}` : auth;
                badge.innerHTML = `
                    <span style="color:#52c41a; font-weight:600; display:flex; align-items:center; gap:6px;">
                        🟢 Đã kết nối Token: <code style="background:#e6ffed; padding:2px 6px; border-radius:4px; font-size:11px; color:#27ae60;">${shortToken}</code>
                    </span>
                `;
            } else {
                badge.innerHTML = `
                    <span style="color:#ff4d4f; font-weight:600; display:flex; align-items:center; gap:6px;">
                        🟠 Chưa nhận Token (Bấm nút "Cài đặt Auth & Kho" bên cạnh để dán hoặc F5 lại trang)
                    </span>
                `;
            }
        }

        if (authInput && !authInput.value && auth) {
            authInput.value = auth;
        }
        const wIdInput = document.getElementById('ghn-receiver-warehouse-id');
        if (wIdInput && !wIdInput.value) {
            wIdInput.value = warehouseId;
        }
    },

    // Mở Modal giao diện Tra cứu
    openModal() {
        const existing = document.getElementById('ghn-bulk-receiver-modal');
        if (existing) {
            existing.style.display = 'flex';
            this.requestTokenFromPage();
            this.updateAuthStatusUI();
            return;
        }

        this.requestTokenFromPage();

        const modal = document.createElement('div');
        modal.id = 'ghn-bulk-receiver-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.6);
            z-index: 999998;
            display: flex;
            justify-content: center;
            align-items: center;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        `;

        chrome.storage.local.get(['bulkReceiverWebhookUrl', 'bulkReceiverDelay', 'bulkReceiverWarehouseId', 'bulkReceiverAuthHeader'], (stored) => {
            const webhookUrl = stored.bulkReceiverWebhookUrl || this.CONFIG.defaultWebhookUrl;
            const delayMs = stored.bulkReceiverDelay || this.CONFIG.defaultDelay;
            const warehouseId = stored.bulkReceiverWarehouseId || this.capturedWarehouseId || '20747000';
            const authHeader = stored.bulkReceiverAuthHeader || this.getAuthHeader() || '';

            modal.innerHTML = `
                <div style="background:#ffffff; border-radius:12px; width:960px; max-width:96vw; max-height:92vh; display:flex; flex-direction:column; box-shadow:0 15px 40px rgba(0,0,0,0.3); overflow:hidden;">
                    <!-- Modal Header -->
                    <div style="padding:16px 22px; background:linear-gradient(135deg, #F26522, #E55310); color:#fff; display:flex; justify-content:space-between; align-items:center;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <span style="font-size:22px;">📦</span>
                            <div>
                                <h3 style="margin:0; font-size:16px; font-weight:700; color:#fff;">Tra Cứu Thông Tin Vận Đơn & Địa Chỉ Hàng Loạt</h3>
                                <p style="margin:2px 0 0 0; font-size:12px; opacity:0.9;">Tra cứu Tên & Địa Chỉ (Qua Phiếu In - Không lỗi đơn ẩn SĐT) hoặc Tên & SĐT, đồng bộ Google Sheet</p>
                            </div>
                        </div>
                        <button id="ghn-receiver-modal-close" style="background:transparent; border:none; color:#fff; font-size:26px; cursor:pointer; line-height:1; opacity:0.85; transition:opacity 0.2s;">&times;</button>
                    </div>

                    <!-- Modal Body -->
                    <div style="padding:18px 22px; overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:14px;">
                        
                        <!-- Auth Status Banner -->
                        <div style="display:flex; justify-content:space-between; align-items:center; background:#fafafa; border:1px solid #e8e8e8; border-radius:8px; padding:10px 14px; font-size:13px;">
                            <div id="ghn-receiver-auth-badge">
                                <span style="color:#666;">Đang kiểm tra phiên đăng nhập...</span>
                            </div>
                            <div style="display:flex; gap:8px; align-items:center;">
                                <button id="ghn-receiver-btn-refresh-token" style="background:#f0f5ff; border:1px solid #adc6ff; color:#1890ff; border-radius:6px; padding:3px 10px; font-size:12px; cursor:pointer; font-weight:600;">
                                    🔄 Quét lại Token
                                </button>
                                <button id="ghn-receiver-btn-toggle-config" style="background:none; border:none; color:#F26522; font-size:12px; cursor:pointer; font-weight:600; text-decoration:underline;">
                                    ⚙️ Cài đặt Auth & Kho
                                </button>
                            </div>
                        </div>

                        <!-- Advanced Config Section (Toggleable) -->
                        <div id="ghn-receiver-config-panel" style="display:none; background:#fffbf7; border:1px solid #ffd591; border-radius:8px; padding:12px 14px; font-size:13px; flex-direction:column; gap:10px;">
                            <div style="font-size:12px; color:#d46b08; font-weight:600;">
                                💡 Mẹo: Tiện ích sẽ tự động nhận diện Token khi bạn lướt web GHN. Nếu tiện ích báo chưa có Token, bạn có thể copy chuỗi <code style="background:#fff; padding:1px 4px; border:1px solid #ffbb96;">Authorization</code> từ DevTools Network dán vào đây:
                            </div>
                            <div style="display:flex; gap:12px; align-items:center;">
                                <label style="font-weight:600; color:#333; width:120px;">Authorization:</label>
                                <input type="text" id="ghn-receiver-auth-input" value="${authHeader}" placeholder="Bearer eyJhbGci..." style="flex:1; padding:6px 10px; border:1px solid #ffbb96; border-radius:6px; font-size:12px; font-family:monospace;">
                            </div>
                            <div style="display:flex; gap:12px; align-items:center;">
                                <label style="font-weight:600; color:#333; width:120px;">X-Warehouseid:</label>
                                <input type="text" id="ghn-receiver-warehouse-id" value="${warehouseId}" placeholder="Ví dụ: 20747000" style="width:160px; padding:6px 10px; border:1px solid #ffbb96; border-radius:6px; font-size:13px; font-family:monospace;">
                                <span style="font-size:12px; color:#888;">(Mã kho nhận diện trong header - mặc định 20747000)</span>
                            </div>
                        </div>

                        <!-- Mode Selector Banner -->
                        <div style="display:flex; align-items:center; gap:20px; background:#f0f5ff; border:1px solid #d6e4ff; border-radius:8px; padding:10px 14px;">
                            <span style="font-weight:700; font-size:13px; color:#1d39c4;">Chế độ tra cứu:</span>
                            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:13px; font-weight:600; color:#1d39c4;">
                                <input type="radio" name="ghn-receiver-mode" id="ghn-mode-print" value="PRINT_ADDRESS" checked style="accent-color:#F26522; cursor:pointer; width:16px; height:16px;">
                                <span>🏠 <b>Địa Chỉ & Tên</b> (Qua Phiếu In - Khuyên dùng cho đơn sàn)</span>
                            </label>
                            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:13px; font-weight:600; color:#555;">
                                <input type="radio" name="ghn-receiver-mode" id="ghn-mode-receiver" value="RECEIVER_INFO" style="accent-color:#F26522; cursor:pointer; width:16px; height:16px;">
                                <span>📱 <b>Số Điện Thoại & Tên</b> (Receiver Info)</span>
                            </label>
                        </div>

                        <!-- Input Section -->
                        <div>
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                <label style="font-size:13px; font-weight:600; color:#333;">
                                    Danh sách mã vận đơn (Copy từ Google Sheet hoặc Excel dán vào):
                                </label>
                                <span id="ghn-receiver-order-count" style="font-size:12px; font-weight:600; color:#F26522; background:#fff3ec; padding:2px 8px; border-radius:10px;">
                                    0 mã đơn
                                </span>
                            </div>
                            <textarea id="ghn-receiver-input" rows="4" placeholder="Dán danh sách mã đơn vào đây (mỗi mã 1 dòng, hoặc cách nhau bởi dấu phẩy/khoảng trắng)...&#10;Ví dụ:&#10;GYYGXWLK&#10;VNGH80213008907" style="width:100%; box-sizing:border-box; border:1.5px solid #d9d9d9; border-radius:8px; padding:10px 12px; font-family:monospace; font-size:13px; resize:vertical; outline:none; transition:border-color 0.2s;"></textarea>
                        </div>

                        <!-- Settings Accordion / Details -->
                        <div style="background:#f8f9fa; border:1px solid #e9ecef; border-radius:8px; padding:10px 14px; font-size:13px;">
                            <div style="display:flex; flex-wrap:wrap; gap:16px; align-items:center;">
                                <div style="display:flex; align-items:center; gap:6px;">
                                    <label style="font-weight:600; color:#555;">Giãn cách (ms):</label>
                                    <input type="number" id="ghn-receiver-delay" value="${delayMs}" min="200" max="3000" step="50" style="width:75px; padding:4px 8px; border:1px solid #ccc; border-radius:6px; font-size:13px;">
                                </div>
                                <div style="display:flex; align-items:center; gap:6px;">
                                    <input type="checkbox" id="ghn-receiver-auto-sync" checked style="cursor:pointer; accent-color:#F26522; width:16px; height:16px;">
                                    <label for="ghn-receiver-auto-sync" style="font-weight:600; color:#333; cursor:pointer;">Tự động gửi sang Google Sheet</label>
                                </div>
                            </div>
                            <div style="margin-top:8px; display:flex; align-items:center; gap:8px;">
                                <label style="font-weight:600; color:#555; white-space:nowrap;">Webhook Sheet:</label>
                                <input type="text" id="ghn-receiver-webhook" value="${webhookUrl}" placeholder="URL Google Apps Script Webhook (/exec)" style="flex:1; padding:4px 8px; border:1px solid #ccc; border-radius:6px; font-size:12px; font-family:monospace;">
                            </div>
                        </div>

                        <!-- Action Control Buttons -->
                        <div style="display:flex; gap:10px; align-items:center;">
                            <button id="ghn-receiver-btn-start" style="background:#F26522; color:#fff; border:none; border-radius:8px; padding:9px 20px; font-weight:700; font-size:13px; cursor:pointer; display:flex; align-items:center; gap:6px; transition:background 0.2s;">
                                <span>🚀 Bắt Đầu Xử Lý</span>
                            </button>
                            <button id="ghn-receiver-btn-stop" disabled style="background:#e0e0e0; color:#888; border:none; border-radius:8px; padding:9px 18px; font-weight:600; font-size:13px; cursor:not-allowed; display:flex; align-items:center; gap:6px;">
                                <span>⏹ Dừng Lại</span>
                            </button>
                            <button id="ghn-receiver-btn-clear" style="background:#fafafa; color:#555; border:1px solid #d9d9d9; border-radius:8px; padding:9px 14px; font-weight:500; font-size:13px; cursor:pointer;">
                                🗑 Xóa Trắng
                            </button>
                            <div style="flex:1;"></div>
                            <button id="ghn-receiver-btn-copy" style="background:#fafafa; color:#333; border:1px solid #d9d9d9; border-radius:8px; padding:8px 12px; font-weight:500; font-size:12px; cursor:pointer; display:flex; align-items:center; gap:5px;">
                                <span>📋 Sao chép kết quả</span>
                            </button>
                            <button id="ghn-receiver-btn-export" style="background:#fafafa; color:#333; border:1px solid #d9d9d9; border-radius:8px; padding:8px 12px; font-weight:500; font-size:12px; cursor:pointer; display:flex; align-items:center; gap:5px;">
                                <span>📥 Xuất CSV</span>
                            </button>
                        </div>

                        <!-- Progress Bar Container -->
                        <div id="ghn-receiver-progress-section" style="display:none; background:#f0f7ff; border:1px solid #bae7ff; border-radius:8px; padding:12px 16px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; font-size:13px;">
                                <span id="ghn-receiver-progress-text" style="font-weight:600; color:#0050b3;">Đang chuẩn bị...</span>
                                <span id="ghn-receiver-stats" style="font-weight:600; font-size:12px; color:#555;">
                                    Thành công: 0 | Thất bại: 0 | Đã lưu Sheet: 0
                                </span>
                            </div>
                            <div style="width:100%; height:8px; background:#e6f7ff; border-radius:4px; overflow:hidden;">
                                <div id="ghn-receiver-progress-fill" style="width:0%; height:100%; background:linear-gradient(90deg, #1890ff, #52c41a); transition:width 0.2s ease;"></div>
                            </div>
                        </div>

                        <!-- Live Results Table -->
                        <div style="border:1px solid #e8e8e8; border-radius:8px; overflow:hidden; flex:1; display:flex; flex-direction:column; min-height:180px;">
                            <div style="background:#fafafa; border-bottom:1px solid #e8e8e8; padding:8px 12px; font-weight:600; font-size:12px; color:#555; display:grid; grid-template-columns: 40px 120px 135px 105px 1fr 90px 100px; gap:6px;">
                                <span>STT</span>
                                <span>Mã Đơn</span>
                                <span>Tên Người Nhận</span>
                                <span>Số ĐT</span>
                                <span>Địa Chỉ</span>
                                <span>Trạng Thái</span>
                                <span>Google Sheet</span>
                            </div>
                            <div id="ghn-receiver-table-body" style="overflow-y:auto; max-height:260px; font-size:13px;">
                                <div style="padding:28px; text-align:center; color:#999; font-style:italic;">
                                    Chưa có dữ liệu tra cứu. Hãy dán mã đơn vào ô phía trên và bấm "Bắt Đầu Xử Lý".
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            this.bindModalEvents();
            this.updateAuthStatusUI();
        });
    },

    // Đóng Modal
    closeModal() {
        const modal = document.getElementById('ghn-bulk-receiver-modal');
        if (modal) modal.style.display = 'none';
    },

    // Gắn sự kiện cho các thành phần trong Modal
    bindModalEvents() {
        const modal = document.getElementById('ghn-bulk-receiver-modal');
        if (!modal) return;

        // Nút Close
        const closeBtn = document.getElementById('ghn-receiver-modal-close');
        if (closeBtn) closeBtn.onclick = () => this.closeModal();

        // Nút Quét lại Token
        const refreshBtn = document.getElementById('ghn-receiver-btn-refresh-token');
        if (refreshBtn) {
            refreshBtn.onclick = () => {
                this.requestTokenFromPage();
                const jwt = this.scanStorageForJwt();
                if (jwt) this.capturedAuth = jwt;
                this.updateAuthStatusUI();
                this.showToast('🔄 Đã quét lại Token từ hệ thống!', 'info');
            };
        }

        // Toggle Config Panel
        const toggleConfigBtn = document.getElementById('ghn-receiver-btn-toggle-config');
        const configPanel = document.getElementById('ghn-receiver-config-panel');
        if (toggleConfigBtn && configPanel) {
            toggleConfigBtn.onclick = () => {
                const isHidden = configPanel.style.display === 'none';
                configPanel.style.display = isHidden ? 'flex' : 'none';
                toggleConfigBtn.textContent = isHidden ? '▲ Thu gọn Cài đặt' : '⚙️ Cài đặt Auth & Kho';
            };
        }

        // Đóng khi click ngoài backdrop
        modal.onclick = (e) => {
            if (e.target === modal) this.closeModal();
        };

        // Textarea count
        const inputArea = document.getElementById('ghn-receiver-input');
        const countLabel = document.getElementById('ghn-receiver-order-count');
        if (inputArea && countLabel) {
            inputArea.addEventListener('input', () => {
                const codes = this.parseInputCodes(inputArea.value);
                countLabel.textContent = `${codes.length} mã đơn hợp lệ`;
            });
        }

        // Bắt đầu
        const startBtn = document.getElementById('ghn-receiver-btn-start');
        if (startBtn) startBtn.onclick = () => this.startProcessing();

        // Dừng lại
        const stopBtn = document.getElementById('ghn-receiver-btn-stop');
        if (stopBtn) stopBtn.onclick = () => this.stopProcessing();

        // Xóa trắng
        const clearBtn = document.getElementById('ghn-receiver-btn-clear');
        if (clearBtn) {
            clearBtn.onclick = () => {
                if (this.isProcessing) return;
                inputArea.value = '';
                countLabel.textContent = '0 mã đơn';
                this.state.orderList = [];
                this.state.results = [];
                document.getElementById('ghn-receiver-table-body').innerHTML = `
                    <div style="padding:28px; text-align:center; color:#999; font-style:italic;">
                        Đã xóa trắng danh sách.
                    </div>
                `;
                document.getElementById('ghn-receiver-progress-section').style.display = 'none';
            };
        }

        // Sao chép kết quả
        const copyBtn = document.getElementById('ghn-receiver-btn-copy');
        if (copyBtn) copyBtn.onclick = () => this.copyResultsToClipboard();

        // Xuất CSV
        const exportBtn = document.getElementById('ghn-receiver-btn-export');
        if (exportBtn) exportBtn.onclick = () => this.exportResultsToCSV();
    },

    // Trích xuất mã đơn gốc (cắt bỏ đuôi kiện/lần giao như -1.1, -1, -01, .1)
    getBaseOrderCode(code) {
        if (!code) return '';
        const trimmed = String(code).trim().toUpperCase();
        const base = trimmed.replace(/-[\d\.]+$/, '').replace(/\.[0-9]+$/, '');
        return base || trimmed;
    },

    // Tách và chuẩn hóa danh sách mã đơn từ Textarea
    parseInputCodes(text) {
        if (!text) return [];
        const rawTokens = text.split(/[\r\n\t,; ]+/);
        const unique = new Set();
        rawTokens.forEach(t => {
            const clean = t.trim().toUpperCase();
            // Cho phép cả chữ, số, gạch dưới, gạch ngang và dấu chấm (ví dụ: AVN90413067-1.1)
            if (clean.length >= 4 && clean.length <= 32 && /^[A-Z0-9_.-]+$/.test(clean)) {
                unique.add(clean);
            }
        });
        return Array.from(unique);
    },

    // Bóc tách dữ liệu từ HTML phiếu in của GHN (DOMParser)
    parsePrintHtml(htmlString) {
        if (!htmlString) return { success: false, error: 'HTML rỗng' };

        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlString, 'text/html');

            let receiverName = '';
            let receiverPhone = '';
            let streetAddress = '';
            let wardDistrict = '';
            let extCode = '';
            let routeCode = '';

            // 1. Cột thông tin người nhận: div có width: 65%
            const col65 = doc.querySelector('div[style*="65%"]');
            if (col65) {
                const clampLines = col65.querySelectorAll('.module.line-clamp-2');
                if (clampLines.length >= 1) receiverName = clampLines[0].textContent.trim();
                if (clampLines.length >= 2) streetAddress = clampLines[1].textContent.trim();

                // Tìm SĐT (nằm trong div bên cạnh tên)
                const allDivs = col65.querySelectorAll('div');
                for (const d of allDivs) {
                    const txt = d.textContent.trim();
                    if (txt && txt !== receiverName && txt !== streetAddress) {
                        if (/^\*+\d+$/.test(txt) || /^\d{8,12}$/.test(txt)) {
                            receiverPhone = txt;
                            break;
                        }
                    }
                }
            }

            // 2. Phường / Xã, Quận / Huyện
            const upperElements = doc.querySelectorAll('div[style*="text-transform: uppercase"], div[style*="text-transform:uppercase"]');
            for (const el of upperElements) {
                const txt = el.textContent.trim();
                if (txt && !txt.includes('CHO XEM HÀNG') && !txt.includes('KHÔNG CHO THỬ') && !txt.includes('KÝ TÊN')) {
                    wardDistrict = txt;
                    break;
                }
            }

            // 3. Mã đơn ngoài (Shopee/TikTok EXT)
            const allElements = doc.querySelectorAll('div');
            for (const el of allElements) {
                const txt = el.textContent;
                if (txt && txt.includes('EXT:')) {
                    const m = txt.match(/EXT:\s*([A-Za-z0-9_-]+)/i);
                    if (m) {
                        extCode = m[1].trim();
                        break;
                    }
                }
            }

            // 4. Mã tuyến giao (Route)
            const bRoute = doc.querySelector('b span');
            if (bRoute) {
                const txt = bRoute.textContent.trim();
                if (/^[A-Z0-9]+-[A-Z0-9-]+$/.test(txt)) {
                    routeCode = txt;
                }
            }

            const fullAddress = [streetAddress, wardDistrict].filter(Boolean).join(', ');

            return {
                success: true,
                receiverName,
                receiverPhone,
                streetAddress,
                wardDistrict,
                fullAddress,
                extCode,
                routeCode
            };
        } catch (e) {
            return { success: false, error: 'Lỗi bóc tách HTML: ' + e.message };
        }
    },

    // Gọi API Phiếu In (printing-page) qua Background để lấy Địa Chỉ & Tên (Khắc phục hoàn toàn đơn bị ẩn SĐT)
    async _callPrintApi(orderCode) {
        const authHeader = this.getAuthHeader();
        const warehouseId = this.getWarehouseId();

        return new Promise((resolve) => {
            chrome.runtime.sendMessage({
                command: 'FETCH_PRINT_INFO',
                orderCode: orderCode,
                authHeader: authHeader,
                warehouseId: warehouseId
            }, (res) => {
                if (chrome.runtime.lastError) {
                    return resolve({
                        success: false,
                        error: chrome.runtime.lastError.message || 'Lỗi kết nối extension'
                    });
                }

                if (!res || res.status !== 'ok') {
                    return resolve({
                        success: false,
                        error: res?.error || 'Lỗi phản hồi API In đơn'
                    });
                }

                const html = res.html;
                if (!html) {
                    return resolve({ success: false, error: 'API không trả về nội dung phiếu in' });
                }

                const parsed = this.parsePrintHtml(html);
                if (!parsed.success) {
                    return resolve({ success: false, error: parsed.error || 'Lỗi đọc phiếu in' });
                }

                return resolve({
                    success: true,
                    receiverName: parsed.receiverName || '',
                    receiverPhone: parsed.receiverPhone || '',
                    address: parsed.fullAddress || '',
                    extCode: parsed.extCode || '',
                    routeCode: parsed.routeCode || ''
                });
            });
        });
    },

    async fetchPrintInfo(orderCode) {
        let res = await this._callPrintApi(orderCode);
        if (!res.success) {
            const baseCode = this.getBaseOrderCode(orderCode);
            if (baseCode && baseCode !== orderCode) {
                console.log(`[BulkReceiver] Phiếu in: Thử lại với mã gốc ${baseCode} thay cho ${orderCode}`);
                const retryRes = await this._callPrintApi(baseCode);
                if (retryRes.success) {
                    return retryRes;
                }
            }
        }
        return res;
    },

    // Gọi API lấy thông tin người nhận (receiver-info) QUA BACKGROUND SERVICE WORKER
    async _callReceiverApi(orderCode) {
        const authHeader = this.getAuthHeader();
        const warehouseId = this.getWarehouseId();

        if (!authHeader) {
            return {
                success: false,
                error: 'Chưa có Token xác thực'
            };
        }

        return new Promise((resolve) => {
            chrome.runtime.sendMessage({
                command: 'FETCH_RECEIVER_INFO',
                orderCode: orderCode,
                authHeader: authHeader,
                warehouseId: warehouseId
            }, (res) => {
                if (chrome.runtime.lastError) {
                    return resolve({
                        success: false,
                        error: chrome.runtime.lastError.message || 'Lỗi kết nối extension'
                    });
                }

                if (!res || res.status !== 'ok') {
                    return resolve({
                        success: false,
                        error: res?.error || 'Lỗi phản hồi API'
                    });
                }

                const data = res.data;
                if (!data) {
                    return resolve({ success: false, error: 'Dữ liệu API trả về trống' });
                }

                // Cấu trúc chuẩn: { code: 200, message: "Thao tác thành công", data: { receiver_name, receiver_phone } }
                if (data.code === 200 && data.data) {
                    return resolve({
                        success: true,
                        receiverName: (data.data.receiver_name || data.data.receiverName || '').trim(),
                        receiverPhone: (data.data.receiver_phone || data.data.receiverPhone || '').trim(),
                        address: ''
                    });
                }

                return resolve({
                    success: false,
                    error: data.message || `Mã code: ${data.code || 'không rõ'}`
                });
            });
        });
    },

    async fetchReceiverInfo(orderCode) {
        let res = await this._callReceiverApi(orderCode);
        if (!res.success) {
            const baseCode = this.getBaseOrderCode(orderCode);
            if (baseCode && baseCode !== orderCode) {
                console.log(`[BulkReceiver] SĐT: Thử lại với mã gốc ${baseCode} thay cho ${orderCode}`);
                const retryRes = await this._callReceiverApi(baseCode);
                if (retryRes.success) {
                    return retryRes;
                }
            }
        }
        return res;
    },

    // Gửi mẻ dữ liệu cập nhật sang Google Sheet (kèm Tên, SĐT, Địa Chỉ)
    async syncBatchToGoogleSheet(records, webhookUrl) {
        if (!records || records.length === 0 || !webhookUrl) return false;

        const payload = records.map(r => {
            // Gửi SĐT dạng chuỗi thô (không thêm dấu ') - Apps Script sẽ tự format
            const rawPhone = (r.receiverPhone || '').replace(/^['"]+/, '');
            return {
                action: 'UPDATE_RECEIVER_INFO',
                orderCode: r.orderCode,
                receiverName: r.receiverName || '',
                receiverPhone: rawPhone,
                contactName: r.receiverName || '',
                contactPhone: rawPhone,
                address: r.address || '',
                extCode: r.extCode || ''
            };
        });

        return new Promise((resolve) => {
            chrome.runtime.sendMessage({
                command: 'SEND_GOOGLE_SHEET_BATCH',
                url: webhookUrl,
                payload: payload
            }, (res) => {
                if (res && res.status === 'ok') {
                    console.log(`[BulkReceiver] ✅ Đã đồng bộ ${records.length} đơn sang Google Sheet:`, res.response);
                    resolve({ success: true, response: res.response });
                } else {
                    console.error(`[BulkReceiver] ❌ Lỗi gửi sang Google Sheet:`, res?.error);
                    resolve({ success: false, error: res?.error || 'Lỗi gửi Sheet' });
                }
            });
        });
    },

    // Bắt đầu quá trình quét hàng loạt
    async startProcessing() {
        if (this.isProcessing) return;

        const inputArea = document.getElementById('ghn-receiver-input');
        const delayInput = document.getElementById('ghn-receiver-delay');
        const autoSyncCheckbox = document.getElementById('ghn-receiver-auto-sync');
        const webhookInput = document.getElementById('ghn-receiver-webhook');
        const authInput = document.getElementById('ghn-receiver-auth-input');
        const warehouseInput = document.getElementById('ghn-receiver-warehouse-id');
        const modeInput = document.querySelector('input[name="ghn-receiver-mode"]:checked');
        const selectedMode = modeInput ? modeInput.value : 'PRINT_ADDRESS';

        const codes = this.parseInputCodes(inputArea?.value || '');
        if (codes.length === 0) {
            this.showToast('Vui lòng nhập ít nhất 1 mã vận đơn hợp lệ!', 'warning');
            inputArea?.focus();
            return;
        }

        // Lấy và lưu Authorization Token
        let authHeader = this.getAuthHeader();
        if (!authHeader) {
            this.showToast('⚠️ Chưa phát hiện Token xác thực! Vui lòng F5 lại trang GHN hoặc dán Token vào ô "Cài đặt Auth & Kho".', 'error');
            const configPanel = document.getElementById('ghn-receiver-config-panel');
            if (configPanel) configPanel.style.display = 'flex';
            if (authInput) authInput.focus();
            return;
        }

        if (warehouseInput && warehouseInput.value.trim()) {
            this.capturedWarehouseId = warehouseInput.value.trim();
        }

        const delayMs = parseInt(delayInput?.value || this.CONFIG.defaultDelay, 10) || this.CONFIG.defaultDelay;
        const autoSync = autoSyncCheckbox ? autoSyncCheckbox.checked : true;
        const webhookUrl = (webhookInput?.value || '').trim() || this.CONFIG.defaultWebhookUrl;

        // Lưu cấu hình vào chrome.storage
        chrome.storage.local.set({
            bulkReceiverWebhookUrl: webhookUrl,
            bulkReceiverDelay: delayMs,
            bulkReceiverWarehouseId: this.capturedWarehouseId,
            bulkReceiverAuthHeader: authHeader
        });

        this.isProcessing = true;
        this.shouldStop = false;

        // Cập nhật UI nút
        const startBtn = document.getElementById('ghn-receiver-btn-start');
        const stopBtn = document.getElementById('ghn-receiver-btn-stop');
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.style.background = '#ccc';
            startBtn.style.cursor = 'not-allowed';
        }
        if (stopBtn) {
            stopBtn.disabled = false;
            stopBtn.style.background = '#ff4d4f';
            stopBtn.style.color = '#fff';
            stopBtn.style.cursor = 'pointer';
        }

        // Hiện thanh tiến trình
        const progressSection = document.getElementById('ghn-receiver-progress-section');
        if (progressSection) progressSection.style.display = 'block';

        this.state.orderList = codes;
        this.state.results = [];
        this.state.currentIndex = 0;
        this.state.successCount = 0;
        this.state.failCount = 0;
        this.state.syncedCount = 0;

        // Chuẩn bị bảng kết quả (có cột Địa Chỉ)
        const tableBody = document.getElementById('ghn-receiver-table-body');
        if (tableBody) {
            tableBody.innerHTML = codes.map((code, idx) => `
                <div id="ghn-row-${code}" style="padding:8px 12px; border-bottom:1px solid #f0f0f0; display:grid; grid-template-columns: 40px 120px 135px 105px 1fr 90px 100px; gap:6px; align-items:center;">
                    <span style="color:#888;">${idx + 1}</span>
                    <span style="font-family:monospace; font-weight:600; color:#333;">${code}</span>
                    <span class="col-name" style="color:#999; font-style:italic;">Chờ...</span>
                    <span class="col-phone" style="color:#999; font-style:italic;">Chờ...</span>
                    <span class="col-address" style="color:#999; font-style:italic; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Chờ...</span>
                    <span class="col-status"><span style="background:#f0f0f0; color:#888; padding:2px 6px; border-radius:4px; font-size:11px;">Chờ xử lý</span></span>
                    <span class="col-sheet"><span style="color:#bbb; font-size:12px;">--</span></span>
                </div>
            `).join('');
        }

        const modeText = selectedMode === 'PRINT_ADDRESS' ? 'Địa Chỉ & Tên (Phiếu In)' : 'SĐT & Tên (Receiver Info)';
        this.showToast(`🚀 Bắt đầu tra cứu ${codes.length} mã đơn [Chế độ: ${modeText}]...`, 'info');

        let pendingSyncBatch = [];
        let activeSyncPromises = []; // Theo dõi các lần gửi Sheet đang chạy nền

        // Helper: Gửi batch lên Sheet KHÔNG chặn vòng lặp chính (fire-and-forget)
        const fireAndForgetSync = (batchToSync) => {
            this.updateBatchSheetStatus(batchToSync, 'syncing');
            const syncPromise = this.syncBatchToGoogleSheet(batchToSync, webhookUrl)
                .then(syncRes => {
                    if (syncRes && syncRes.success) {
                        this.state.syncedCount += batchToSync.length;
                        this.updateBatchSheetStatus(batchToSync, 'synced');
                    } else {
                        this.updateBatchSheetStatus(batchToSync, 'sync_error');
                    }
                    this.updateProgressUI();
                })
                .catch(() => {
                    this.updateBatchSheetStatus(batchToSync, 'sync_error');
                });
            activeSyncPromises.push(syncPromise);
        };

        // Vòng lặp xử lý từng mã đơn
        for (let i = 0; i < codes.length; i++) {
            if (this.shouldStop) {
                console.log('[BulkReceiver] Người dùng bấm Dừng!');
                this.showToast(`⏹ Đã tạm dừng tại đơn thứ ${i}/${codes.length}.`, 'warning');
                break;
            }

            const code = codes[i];
            this.state.currentIndex = i + 1;
            this.updateRowUI(code, { status: 'running' });
            this.updateProgressUI();

            // Gọi API tùy theo chế độ đã chọn
            const info = (selectedMode === 'PRINT_ADDRESS')
                ? await this.fetchPrintInfo(code)
                : await this.fetchReceiverInfo(code);

            const resultItem = {
                orderCode: code,
                receiverName: info.receiverName || '',
                receiverPhone: info.receiverPhone || '',
                address: info.address || '',
                extCode: info.extCode || '',
                success: info.success,
                error: info.error,
                synced: false
            };

            this.state.results.push(resultItem);

            if (info.success) {
                this.state.successCount++;
                this.updateRowUI(code, {
                    name: info.receiverName,
                    phone: info.receiverPhone,
                    address: info.address,
                    status: 'success'
                });
                pendingSyncBatch.push(resultItem);
            } else {
                this.state.failCount++;
                this.updateRowUI(code, {
                    name: '--',
                    phone: '--',
                    address: '--',
                    status: 'error',
                    errorMsg: info.error
                });
            }

            // Tự động đồng bộ theo từng mẻ (batch) nếu bật autoSync
            // ⚡ FIRE-AND-FORGET: Gửi Sheet chạy nền, KHÔNG chặn vòng lặp tra cứu API
            if (autoSync && pendingSyncBatch.length >= this.CONFIG.batchSyncSize) {
                const batchToSync = [...pendingSyncBatch];
                pendingSyncBatch = [];
                fireAndForgetSync(batchToSync);
            }

            this.updateProgressUI();

            // Delay giữa các request để an toàn
            if (i < codes.length - 1 && !this.shouldStop) {
                await new Promise(r => setTimeout(r, delayMs));
            }
        }

        // Gửi nốt các đơn còn lại trong batch sang Google Sheet
        if (autoSync && pendingSyncBatch.length > 0 && !this.shouldStop) {
            const batchToSync = [...pendingSyncBatch];
            pendingSyncBatch = [];
            fireAndForgetSync(batchToSync);
        }

        // Chờ tất cả các lần gửi Sheet đang chạy nền hoàn tất trước khi kết thúc
        if (activeSyncPromises.length > 0) {
            await Promise.allSettled(activeSyncPromises);
            this.updateProgressUI();
        }

        this.finishProcessing();
    },

    // Cập nhật trạng thái từng dòng trên bảng
    updateRowUI(code, data) {
        const row = document.getElementById(`ghn-row-${code}`);
        if (!row) return;

        const nameEl = row.querySelector('.col-name');
        const phoneEl = row.querySelector('.col-phone');
        const addressEl = row.querySelector('.col-address');
        const statusEl = row.querySelector('.col-status');

        if (data.status === 'running') {
            if (statusEl) statusEl.innerHTML = `<span style="background:#e6f7ff; color:#1890ff; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:600;">Đang lấy...</span>`;
            row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else if (data.status === 'success') {
            if (nameEl) {
                nameEl.textContent = data.name || '(Trống tên)';
                nameEl.style.color = '#333';
                nameEl.style.fontStyle = 'normal';
                nameEl.style.fontWeight = '500';
            }
            if (phoneEl) {
                phoneEl.textContent = data.phone || '(Trống SĐT)';
                phoneEl.style.color = '#F26522';
                phoneEl.style.fontStyle = 'normal';
                phoneEl.style.fontWeight = '700';
            }
            if (addressEl) {
                addressEl.textContent = data.address || '(Trống địa chỉ)';
                addressEl.title = data.address || '';
                addressEl.style.color = '#2f54eb';
                addressEl.style.fontStyle = 'normal';
                addressEl.style.fontWeight = '500';
            }
            if (statusEl) {
                statusEl.innerHTML = `<span style="background:#f6ffed; color:#52c41a; border:1px solid #b7eb8f; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:600;">Thành công</span>`;
            }
        } else if (data.status === 'error') {
            if (nameEl) {
                nameEl.textContent = '--';
                nameEl.style.color = '#999';
            }
            if (phoneEl) {
                phoneEl.textContent = '--';
                phoneEl.style.color = '#999';
            }
            if (addressEl) {
                addressEl.textContent = '--';
                addressEl.style.color = '#999';
            }
            if (statusEl) {
                const msg = data.errorMsg || 'Lỗi';
                statusEl.innerHTML = `<span title="${msg}" style="background:#fff1f0; color:#ff4d4f; border:1px solid #ffa39e; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:600;">${msg.substring(0, 16)}</span>`;
            }
        }
    },

    // Cập nhật trạng thái cột Google Sheet cho cả batch
    updateBatchSheetStatus(batch, status) {
        batch.forEach(item => {
            const row = document.getElementById(`ghn-row-${item.orderCode}`);
            if (!row) return;
            const sheetEl = row.querySelector('.col-sheet');
            if (!sheetEl) return;

            if (status === 'syncing') {
                sheetEl.innerHTML = `<span style="color:#1890ff; font-size:11px;">Đang gửi Sheet...</span>`;
            } else if (status === 'synced') {
                item.synced = true;
                sheetEl.innerHTML = `<span style="background:#e6fffb; color:#13c2c2; border:1px solid #87e8de; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:600;">✓ Đã lưu Sheet</span>`;
            } else if (status === 'sync_error') {
                sheetEl.innerHTML = `<span style="color:#ff4d4f; font-size:11px; font-weight:600;">✕ Lỗi Sheet</span>`;
            }
        });
    },

    // Cập nhật thanh tiến trình và thông số thống kê
    updateProgressUI() {
        const total = this.state.orderList.length;
        const current = this.state.currentIndex;
        const percent = total > 0 ? Math.round((current / total) * 100) : 0;

        const fillEl = document.getElementById('ghn-receiver-progress-fill');
        const textEl = document.getElementById('ghn-receiver-progress-text');
        const statsEl = document.getElementById('ghn-receiver-stats');

        if (fillEl) fillEl.style.width = `${percent}%`;
        if (textEl) textEl.textContent = `Tiến độ: ${current} / ${total} đơn (${percent}%)`;
        if (statsEl) {
            statsEl.innerHTML = `
                <span style="color:#52c41a;">✓ Thành công: ${this.state.successCount}</span> | 
                <span style="color:#ff4d4f;">✕ Thất bại: ${this.state.failCount}</span> | 
                <span style="color:#13c2c2; font-weight:700;">📊 Đã lưu Sheet: ${this.state.syncedCount}</span>
            `;
        }
    },

    // Dừng tiến trình
    stopProcessing() {
        if (!this.isProcessing) return;
        this.shouldStop = true;
        const stopBtn = document.getElementById('ghn-receiver-btn-stop');
        if (stopBtn) {
            stopBtn.disabled = true;
            stopBtn.textContent = 'Đang dừng...';
        }
    },

    // Hoàn tất tiến trình
    finishProcessing() {
        this.isProcessing = false;
        this.shouldStop = false;

        const startBtn = document.getElementById('ghn-receiver-btn-start');
        const stopBtn = document.getElementById('ghn-receiver-btn-stop');
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.style.background = '#F26522';
            startBtn.style.cursor = 'pointer';
        }
        if (stopBtn) {
            stopBtn.disabled = true;
            stopBtn.style.background = '#e0e0e0';
            stopBtn.style.color = '#888';
            stopBtn.style.cursor = 'not-allowed';
            stopBtn.innerHTML = `<span>⏹ Dừng Lại</span>`;
        }

        const msg = `🎉 Đã hoàn tất tra cứu ${this.state.results.length} đơn! (Thành công: ${this.state.successCount}, Sheet: ${this.state.syncedCount})`;
        this.showToast(msg, 'success');
    },

    // Sao chép kết quả (Mã đơn \t Tên \t SĐT \t Địa Chỉ \t Trạng Thái) vào Clipboard
    copyResultsToClipboard() {
        if (this.state.results.length === 0) {
            this.showToast('Chưa có kết quả nào để sao chép!', 'warning');
            return;
        }

        const lines = [
            'Mã Vận Đơn\tTên Người Nhận\tSố Điện Thoại\tĐịa Chỉ\tMã Đơn Sàn (EXT)\tTrạng Thái'
        ];

        this.state.results.forEach(r => {
            lines.push(`${r.orderCode}\t${r.receiverName}\t${r.receiverPhone}\t${r.address || ''}\t${r.extCode || ''}\t${r.success ? 'Thành công' : (r.error || 'Lỗi')}`);
        });

        const textToCopy = lines.join('\n');
        navigator.clipboard.writeText(textToCopy).then(() => {
            this.showToast('📋 Đã sao chép toàn bộ kết quả vào Clipboard!', 'success');
        }).catch(() => {
            this.showToast('Không thể tự động sao chép. Vui lòng thử Xuất CSV.', 'error');
        });
    },

    // Xuất kết quả ra file CSV (kèm Địa Chỉ và Mã EXT)
    exportResultsToCSV() {
        if (this.state.results.length === 0) {
            this.showToast('Chưa có kết quả nào để xuất file!', 'warning');
            return;
        }

        let csvContent = '\uFEFFMã Vận Đơn,Tên Người Nhận,Số Điện Thoại,Địa Chỉ,Mã Đơn Sàn (EXT),Trạng Thái,Đã Lưu Sheet\n';
        this.state.results.forEach(r => {
            const name = `"${(r.receiverName || '').replace(/"/g, '""')}"`;
            const phone = `"${(r.receiverPhone || '').replace(/"/g, '""')}"`;
            const address = `"${(r.address || '').replace(/"/g, '""')}"`;
            const ext = `"${(r.extCode || '').replace(/"/g, '""')}"`;
            const status = `"${r.success ? 'Thành công' : (r.error || 'Lỗi')}"`;
            const synced = r.synced ? 'Có' : 'Chưa';
            csvContent += `${r.orderCode},${name},${phone},${address},${ext},${status},${synced}\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `GHN_Receiver_Info_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        this.showToast('📥 Đã tải file CSV thành công!', 'success');
    },

    start() {
        if (this.isRunning) return;
        this.isRunning = true;

        this.injectFloatingButton();

        // Lắng nghe Message mở modal từ Extension Popup
        this.messageListener = (request, sender, sendResponse) => {
            if (request.command === 'OPEN_BULK_RECEIVER_INFO') {
                this.openModal();
                if (sendResponse) sendResponse({ status: 'ok' });
            }
        };
        chrome.runtime.onMessage.addListener(this.messageListener);

        // Lắng nghe postMessage từ inject.js để nhận Auth & Warehouse
        this.postMessageListener = (event) => {
            if (event.data && event.data.type === 'GHN_AUTH_CAPTURED') {
                if (event.data.authHeader) {
                    this.capturedAuth = event.data.authHeader;
                    chrome.storage.local.set({ bulkReceiverAuthHeader: event.data.authHeader });
                }
                if (event.data.warehouseId) {
                    this.capturedWarehouseId = event.data.warehouseId;
                    chrome.storage.local.set({ bulkReceiverWarehouseId: event.data.warehouseId });
                }
                this.updateAuthStatusUI();
            }
        };
        window.addEventListener('message', this.postMessageListener);

        // Quét ngay storage lúc start
        const initialJwt = this.scanStorageForJwt();
        if (initialJwt) {
            this.capturedAuth = initialJwt;
        }
        this.requestTokenFromPage();

        console.log("GHN Helper Pro: Bulk Receiver Info Feature Started!");
    },

    stop() {
        this.isRunning = false;
        if (this.isProcessing) {
            this.stopProcessing();
        }

        const fab = document.getElementById('ghn-fab-bulk-receiver');
        if (fab) fab.remove();

        const modal = document.getElementById('ghn-bulk-receiver-modal');
        if (modal) modal.remove();

        if (this.messageListener) {
            chrome.runtime.onMessage.removeListener(this.messageListener);
            this.messageListener = null;
        }

        if (this.postMessageListener) {
            window.removeEventListener('message', this.postMessageListener);
            this.postMessageListener = null;
        }

        console.log("GHN Helper Pro: Bulk Receiver Info Feature Stopped!");
    }
};

// Đăng ký module với GHNConfigManager
if (window.GHNConfigManager) {
    window.GHNConfigManager.registerFeature(BulkReceiverInfoFeature.id, BulkReceiverInfoFeature);
}
