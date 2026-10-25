const OrderCheckerFeature = {
    id: 'feature_orderChecker',
    isRunning: false,
    pendingOrders: new Set(),
    scannedOrders: new Set(),
    processedCount: 0,
    totalOrders: 0,
    observer: null,
    urlCheckInterval: null,
    lastURL: null,
    inputListener: null,

    CONFIG: {
        selectors: {
            statusTitle: '[class*="viewTitle"], [class*="_viewTitle_"]',
            orderItem: '[class*="itemOrder"], [class*="_itemOrder_"]',
            activeOrder: '[class*="itemOrder__active"], [class*="_itemOrder__active_"], [class*="active"], [class*="checked"], [class*="success"]',
            inputField: '#orderCode, #form-input-order-code_orderCode, input[placeholder*="Quét mã" i]'
        }
    },

    isTargetPage() {
        const href = (window.location.href || '').toLowerCase();
        const pathname = (window.location.pathname || '').toLowerCase();
        return href.includes('check-scan') || pathname.includes('check-scan');
    },

    playSound(index) {
        if (index <= 0) return;
        // Xoay vòng từ 1.mp3 đến 7.mp3: (1 -> 1, 7 -> 7, 8 -> 1,...)
        const soundNum = ((index - 1) % 7) + 1;
        const url = chrome.runtime.getURL(`assets/sounds/${soundNum}.mp3`);
        
        try {
            const audio = new Audio(url);
            audio.volume = 1.0;
            audio.currentTime = 0;
            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.catch(err => {
                    console.warn(`GHN Helper Pro: Trình duyệt chặn phát âm thanh (${soundNum}.mp3):`, err);
                    // Thử lại sau 150ms
                    setTimeout(() => {
                        audio.play().catch(() => {});
                    }, 150);
                });
            }
        } catch (e) {
            console.error("GHN Helper Pro: Lỗi phát âm thanh OrderChecker:", e);
        }
    },

    playSuccessSound() {
        try {
            const url = chrome.runtime.getURL('assets/sounds/success.mp3');
            const audio = new Audio(url);
            audio.volume = 1.0;
            audio.currentTime = 0;
            audio.play().catch(() => {});
        } catch (e) {}
    },

    // Tìm các phần tử tiêu đề nhóm trạng thái "Chờ Trả"
    getPendingReturnSections() {
        let titles = Array.from(document.querySelectorAll(this.CONFIG.selectors.statusTitle));
        if (titles.length === 0) {
            titles = Array.from(document.querySelectorAll('div, span, p, h3, h4')).filter(el => {
                const t = el.innerText?.trim() || '';
                return (t.includes('Chờ Trả') || t.includes('chờ trả') || t.includes('ĐH Chờ Trả')) && el.children.length <= 2 && t.length < 60;
            });
        }

        return titles.filter(el => {
            const t = (el.innerText || el.textContent || '').toLowerCase();
            return t.includes('chờ trả') || t.includes('cho tra');
        });
    },

    // Quét DOM lấy danh sách tất cả các mã đơn chờ trả hiện tại
    loadPendingOrders() {
        const sections = this.getPendingReturnSections();
        const pending = new Set();
        const active = new Set();

        sections.forEach(sec => {
            const container = sec.closest('[class*="group"], [class*="section"], [class*="wrapper"], [class*="card"], .ant-card') || sec.parentElement;
            if (!container) return;

            const items = container.querySelectorAll(this.CONFIG.selectors.orderItem);
            items.forEach(item => {
                const rawText = (item.innerText || item.textContent || '').trim().toUpperCase();
                if (!rawText) return;

                // Tách lấy mã đơn đầu tiên (bỏ qua các dòng chú thích / tag nếu có)
                const code = rawText.split(/[\s\n\r]+/)[0];
                if (!code) return;

                const isItemActive = item.className.includes('active') || 
                                     item.className.includes('checked') || 
                                     item.className.includes('success') ||
                                     (typeof item.matches === 'function' && item.matches(this.CONFIG.selectors.activeOrder));

                if (isItemActive) {
                    active.add(code);
                } else {
                    pending.add(code);
                }
            });
        });

        return { pending, active };
    },

    // Cập nhật danh sách đơn từ DOM theo thời gian thực
    syncOrdersFromDOM() {
        if (!this.isRunning || !this.isTargetPage()) return;

        const { pending, active } = this.loadPendingOrders();
        
        // Cập nhật tổng số đơn ban đầu nếu chưa có hoặc có dữ liệu mới
        const total = pending.size + active.size;
        if (total > 0 && total !== this.totalOrders) {
            this.totalOrders = total;
            console.log(`GHN Helper Pro: Order Checker - Phát hiện tổng cộng ${this.totalOrders} đơn chờ trả (${pending.size} chờ, ${active.size} đã quét)`);
        }

        this.pendingOrders = pending;

        // Đồng bộ các đơn đã active trên giao diện vào danh sách đã quét
        active.forEach(code => {
            if (!this.scannedOrders.has(code)) {
                this.scannedOrders.add(code);
            }
        });

        // Đảm bảo ô input luôn được gắn bộ lắng nghe
        this.setupInput();
    },

    setupInput() {
        const input = document.querySelector(this.CONFIG.selectors.inputField);
        if (!input) return;

        if (input.hasAttribute('data-ghn-checker-listener')) return;

        this.inputListener = (e) => {
            if (!this.isRunning) return;
            if (e.key === "Enter") {
                const rawCode = (input.value || '').trim();
                const code = rawCode.toUpperCase().split(/[\s\n\r]+/)[0];

                if (!code) return;

                // 1. Đồng bộ nhanh dữ liệu mới nhất từ DOM
                const { pending, active } = this.loadPendingOrders();
                
                // Kiểm tra xem mã có thuộc danh sách chờ trả không
                const matchedPendingCode = Array.from(pending).find(p => p === code || p.includes(code) || code.includes(p));
                const isAlreadyScanned = active.has(code) || this.scannedOrders.has(code) || Array.from(this.scannedOrders).some(s => s === code || s.includes(code) || code.includes(s));

                if (!matchedPendingCode && !isAlreadyScanned) {
                    console.log("GHN Helper Pro: ⚠️ Mã không nằm trong danh sách ĐH Chờ Trả:", code);
                    return;
                }

                if (isAlreadyScanned) {
                    console.log("GHN Helper Pro: ℹ️ Đơn này đã được quét trước đó:", code);
                    return;
                }

                const finalCode = matchedPendingCode || code;

                // 2. Ghi nhận quét thành công
                this.scannedOrders.add(finalCode);
                this.pendingOrders.delete(finalCode);
                this.processedCount++;

                console.log(`GHN Helper Pro: 🎯 ACTIVE đơn [${finalCode}] thành công! Tiến độ: ${this.processedCount}/${this.totalOrders || (this.processedCount + this.pendingOrders.size)}`);
                
                // 3. Phát âm thanh ngay lập tức (Direct User Gesture)
                this.playSound(this.processedCount);

                // 4. Nếu đã hoàn thành toàn bộ danh sách đơn chờ trả
                const remaining = this.pendingOrders.size;
                if (this.totalOrders > 0 && this.scannedOrders.size >= this.totalOrders || (remaining === 0 && this.totalOrders > 0)) {
                    console.log("GHN Helper Pro: 🎉 Đã kiểm tra xong TOÀN BỘ đơn chờ trả!");
                    setTimeout(() => this.playSuccessSound(), 500);
                }
            }
        };

        input.addEventListener("keydown", this.inputListener);
        input.setAttribute('data-ghn-checker-listener', 'true');
    },

    initPage() {
        if (!this.isTargetPage()) return;

        this.processedCount = 0;
        this.scannedOrders.clear();
        this.pendingOrders.clear();
        this.totalOrders = 0;

        console.log("GHN Helper Pro: Order Checker - Khởi tạo theo dõi trang kiểm đơn...");

        // Quét ngay lần đầu
        this.syncOrdersFromDOM();

        // Khởi tạo MutationObserver để tự động nhận diện DOM khi trang load xong hoặc cập nhật
        if (this.observer) {
            this.observer.disconnect();
        }

        this.observer = new MutationObserver(() => {
            if (!this.isRunning) return;
            this.syncOrdersFromDOM();
        });

        const targetNode = document.body;
        if (!targetNode) {
            console.warn("GHN Helper Pro: [OrderChecker] document.body chưa sẵn sàng, hoãn observe.");
            return;
        }
        this.observer.observe(targetNode, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style']
        });
    },

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.lastURL = location.href;

        this.initPage();

        // 1. Lắng nghe sự kiện chuyển trang SPA
        this.locationChangeListener = () => {
            if (!this.isRunning) return;
            this.lastURL = location.href;
            this.initPage();
            setTimeout(() => this.initPage(), 300);
        };
        window.addEventListener('GHN_LOCATION_CHANGED', this.locationChangeListener);
        window.addEventListener('popstate', this.locationChangeListener);
        window.addEventListener('hashchange', this.locationChangeListener);

        // 2. Polling URL định kỳ phòng hờ
        if (!this.urlCheckInterval) {
            this.urlCheckInterval = setInterval(() => {
                if (location.href !== this.lastURL) {
                    this.lastURL = location.href;
                    if (this.isRunning) {
                        this.initPage();
                    }
                }
            }, 500);
        }

        // 3. Nếu DOM chưa tải xong lúc start, đợi DOMContentLoaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                if (this.isRunning) {
                    this.initPage();
                }
            }, { once: true });
        }
    },

    stop() {
        this.isRunning = false;
        
        if (this.urlCheckInterval) {
            clearInterval(this.urlCheckInterval);
            this.urlCheckInterval = null;
        }

        if (this.locationChangeListener) {
            window.removeEventListener('GHN_LOCATION_CHANGED', this.locationChangeListener);
            window.removeEventListener('popstate', this.locationChangeListener);
            window.removeEventListener('hashchange', this.locationChangeListener);
            this.locationChangeListener = null;
        }

        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }

        const input = document.querySelector(this.CONFIG.selectors.inputField);
        if (input && this.inputListener) {
            input.removeEventListener("keydown", this.inputListener);
            input.removeAttribute('data-ghn-checker-listener');
        }

        this.pendingOrders.clear();
        this.scannedOrders.clear();
        this.processedCount = 0;
        this.totalOrders = 0;
    }
};

// Register module
if (window.GHNConfigManager) {
    window.GHNConfigManager.registerFeature(OrderCheckerFeature.id, OrderCheckerFeature);
}
