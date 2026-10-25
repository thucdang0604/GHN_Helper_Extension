const AutoCloseModalFeature = {
    id: 'feature_autoCloseModal',
    isRunning: false,
    observer: null,

    isTargetPage() {
        // Chỉ áp dụng duy nhất cho trang Rã kiện (https://nhanh.ghn.vn/lastmile/unpack)
        return window.location.pathname.includes('/lastmile/unpack') || window.location.href.includes('/lastmile/unpack');
    },

    handleModals() {
        if (!this.isRunning || !this.isTargetPage()) return;

        // Tìm các hộp thoại thông báo / modal confirm của Ant Design
        const modals = document.querySelectorAll('.ant-modal-confirm, .ant-modal[role="dialog"], [role="dialog"].ant-modal');

        modals.forEach(modal => {
            if (modal.hasAttribute('data-ghn-auto-closed')) return;

            // Tìm nút "Đóng" trong khu vực các nút bấm của modal
            const btnsWrapper = modal.querySelector('.ant-modal-confirm-btns') || modal.querySelector('.ant-modal-footer') || modal;
            const buttons = btnsWrapper.querySelectorAll('button');

            let closeBtn = null;
            buttons.forEach(btn => {
                const btnText = btn.textContent.trim().toLowerCase();
                if (btnText === 'đóng' || btnText === 'dong' || btnText === 'close') {
                    closeBtn = btn;
                }
            });

            // Nếu không tìm thấy bằng so sánh chính xác, tìm nút có chứa chữ "Đóng"
            if (!closeBtn) {
                buttons.forEach(btn => {
                    if (btn.textContent.includes('Đóng') || btn.textContent.includes('đóng')) {
                        closeBtn = btn;
                    }
                });
            }

            if (closeBtn) {
                // Đánh dấu để tránh trigger click lặp lại nhiều lần
                modal.setAttribute('data-ghn-auto-closed', 'true');

                const title = modal.querySelector('.ant-modal-confirm-title')?.textContent?.trim() || 'Thông báo';
                const content = modal.querySelector('.ant-modal-confirm-content')?.textContent?.trim() || '';

                console.log(`GHN Helper Pro: ⚡ [Rã Kiện] Phát hiện [${title}]: "${content}" -> Tự động click nút "Đóng"`);

                // Kích hoạt click đóng bảng
                closeBtn.click();

                // Tự động focus lại vào ô nhập liệu / quét mã để tiếp tục quét
                setTimeout(() => {
                    const scanInput = document.querySelector('#form-input-order-code_orderCode, #orderCode, input.ant-input:not([disabled])');
                    if (scanInput && typeof scanInput.focus === 'function') {
                        scanInput.focus();
                    }
                }, 100);
            }
        });
    },

    start() {
        this.isRunning = true;
        this.handleModals();

        if (!this.observer) {
            this.observer = new MutationObserver(() => {
                if (this.isRunning) {
                    this.handleModals();
                }
            });
        }

        const targetNode = document.body;
        if (!targetNode) {
            console.warn("GHN Helper Pro: [AutoCloseModal] document.body chưa sẵn sàng, hoãn observe.");
            return;
        }
        this.observer.observe(targetNode, {
            childList: true,
            subtree: true
        });

        console.log("GHN Helper Pro: Auto Close Modal (Rã Kiện) Feature Started!");
    },

    stop() {
        this.isRunning = false;
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        console.log("GHN Helper Pro: Auto Close Modal (Rã Kiện) Feature Stopped!");
    }
};

// Register module
if (window.GHNConfigManager) {
    window.GHNConfigManager.registerFeature(AutoCloseModalFeature.id, AutoCloseModalFeature);
}
