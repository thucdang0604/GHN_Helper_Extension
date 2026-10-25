const BulkAssignFeature = {
    id: 'feature_bulkAssign',
    isRunning: false,
    observer: null,
    pollInterval: null,

    // Kiểm tra phần tử có đang thực sự hiển thị (không bị display:none hay ẩn)
    // KHÔNG dùng el.offsetParent !== null vì bên trong modal fixed của Edge/Chrome, offsetParent luôn trả về null
    isVisible(el) {
        if (!el) return false;
        try {
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                return false;
            }
            return (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0);
        } catch (e) {
            return false;
        }
    },

    addBulkAssignButton() {
        // 1. Tìm modal container đang hiển thị trên màn hình
        const modals = document.querySelectorAll('.ant-modal-container, .ant-modal-body, .ant-modal, [class*="contentModal"], [class*="_contentModal_"]');
        let modalContainer = null;
        let assignBtns = [];

        for (const modal of modals) {
            if (!this.isVisible(modal)) continue;

            const btns = Array.from(modal.querySelectorAll('button')).filter(btn => {
                if (btn.closest('.ghn-bulk-assign-wrap')) return false;
                const text = btn.textContent.trim();
                return (text === 'Gán đơn' || text.includes('Gán đơn')) && this.isVisible(btn);
            });

            if (btns.length > 0) {
                modalContainer = modal.closest('.ant-modal-container') || modal.closest('.ant-modal') || modal;
                assignBtns = btns;
                break;
            }
        }

        // Fallback: Tìm tất cả các nút "Gán đơn" đang có trên trang nếu không tìm thấy qua modal
        if (assignBtns.length === 0) {
            const allBtns = document.querySelectorAll('button');
            for (const btn of allBtns) {
                if (btn.closest('.ghn-bulk-assign-wrap')) continue;
                const text = btn.textContent.trim();
                if ((text === 'Gán đơn' || text.includes('Gán đơn')) && this.isVisible(btn)) {
                    assignBtns.push(btn);
                    if (!modalContainer) {
                        modalContainer = btn.closest('.ant-modal-container')
                            || btn.closest('.ant-modal-body')
                            || btn.closest('.ant-modal')
                            || btn.closest('.ant-modal-content')
                            || btn.closest('[role="dialog"]');
                    }
                }
            }
        }

        const existingWrap = document.querySelector('.ghn-bulk-assign-wrap');

        // Nếu không có nút "Gán đơn" nào hoặc không có modal, xóa nút bulk nếu đang tồn tại
        if (assignBtns.length === 0 || !modalContainer) {
            if (existingWrap) {
                existingWrap.remove();
            }
            return;
        }

        // Nếu nút gán tất cả đã có trong modal
        if (existingWrap) {
            const countSpan = existingWrap.querySelector('.ghn-count');
            const btn = existingWrap.querySelector('button');
            if (countSpan && btn && !btn.disabled) {
                if (countSpan.textContent !== String(assignBtns.length)) {
                    countSpan.textContent = assignBtns.length;
                }
            }
            return;
        }

        // Tạo khung bọc nút để đẩy nút sang bên phải cho đẹp
        const wrap = document.createElement('div');
        wrap.className = 'ghn-bulk-assign-wrap';
        wrap.style.display = 'flex';
        wrap.style.justifyContent = 'flex-end';
        wrap.style.marginBottom = '12px';
        wrap.style.marginTop = '6px';
        wrap.style.paddingRight = '4px';

        const bulkAssignBtn = document.createElement('button');
        bulkAssignBtn.type = 'button';
        bulkAssignBtn.style.backgroundColor = '#FF5500';
        bulkAssignBtn.style.border = 'none';
        bulkAssignBtn.style.borderRadius = '8px';
        bulkAssignBtn.style.color = '#ffffff';
        bulkAssignBtn.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
        bulkAssignBtn.style.fontSize = '14px';
        bulkAssignBtn.style.fontWeight = '600';
        bulkAssignBtn.style.padding = '8px 20px';
        bulkAssignBtn.style.cursor = 'pointer';
        bulkAssignBtn.style.transition = 'all 0.2s ease';
        bulkAssignBtn.style.boxShadow = '0 2px 6px rgba(255, 85, 0, 0.25)';
        bulkAssignBtn.style.outline = 'none';

        bulkAssignBtn.onmouseover = () => { bulkAssignBtn.style.backgroundColor = '#e04800'; };
        bulkAssignBtn.onmouseout = () => {
            if (!bulkAssignBtn.disabled) bulkAssignBtn.style.backgroundColor = '#FF5500';
        };

        bulkAssignBtn.innerHTML = `<span>⚡ Gán tất cả (<span class="ghn-count">${assignBtns.length}</span> đơn)</span>`;

        wrap.appendChild(bulkAssignBtn);

        // Chèn nút vào bên trong modal đang hiển thị, ngay dưới mô tả và phía trên danh sách bảng
        const descElem = modalContainer.querySelector('[class*="textDesc"], [class*="_textDesc_"]');
        const tableWrap = modalContainer.querySelector('.ant-table-wrapper')?.closest('.border')
            || modalContainer.querySelector('.ant-table-wrapper')
            || modalContainer.querySelector('table')?.closest('div');

        if (descElem && descElem.parentNode) {
            descElem.insertAdjacentElement('afterend', wrap);
        } else if (tableWrap && tableWrap.parentNode) {
            tableWrap.parentNode.insertBefore(wrap, tableWrap);
        } else {
            const body = modalContainer.querySelector('.ant-modal-body') || modalContainer;
            body.insertBefore(wrap, body.firstChild);
        }

        bulkAssignBtn.addEventListener('click', () => {
            const currentAssignBtns = Array.from((modalContainer || document).querySelectorAll('button')).filter(btn => {
                if (btn.closest('.ghn-bulk-assign-wrap')) return false;
                const text = btn.textContent.trim();
                return (text === 'Gán đơn' || text.includes('Gán đơn')) && !btn.disabled && this.isVisible(btn);
            });

            if (currentAssignBtns.length === 0) return;

            let count = 0;
            currentAssignBtns.forEach(btn => {
                setTimeout(() => {
                    if (btn && !btn.disabled) {
                        btn.click();
                    }
                }, count * 350);
                count++;
            });

            bulkAssignBtn.innerHTML = `<span>⏳ Đang gán (${count}) đơn...</span>`;
            bulkAssignBtn.disabled = true;
            bulkAssignBtn.style.backgroundColor = '#999';
            bulkAssignBtn.style.borderColor = '#999';

            setTimeout(() => {
                if (wrap.parentNode) {
                    wrap.remove();
                }
            }, count * 350 + 500);
        });
    },

    start() {
        this.isRunning = true;
        this.addBulkAssignButton();

        // 1. Observer theo dõi các thay đổi DOM
        if (!this.observer) {
            let timeout;
            this.observer = new MutationObserver(() => {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    if (this.isRunning) {
                        this.addBulkAssignButton();
                    }
                }, 150);
            });
        }

        const targetNode = document.body;
        if (targetNode) {
            this.observer.observe(targetNode, { childList: true, subtree: true });
        }

        // 2. Interval dự phòng chạy mỗi 500ms để bắt các modal render trễ hoặc animation
        if (!this.pollInterval) {
            this.pollInterval = setInterval(() => {
                if (this.isRunning) {
                    this.addBulkAssignButton();
                }
            }, 500);
        }
    },

    stop() {
        this.isRunning = false;

        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }

        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }

        const btn = document.querySelector('.ghn-bulk-assign-wrap');
        if (btn) {
            btn.remove();
        }
    }
};

// Register module
if (window.GHNConfigManager) {
    window.GHNConfigManager.registerFeature(BulkAssignFeature.id, BulkAssignFeature);
}
