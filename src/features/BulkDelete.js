const BulkDeleteFeature = {
    id: 'feature_bulkDelete',
    isRunning: false,
    observer: null,
    monitorInterval: null,

    getHeaderElement() {
        return document.querySelector('[class*="orderHeader"], [class*="_orderHeader_"]');
    },

    getOrderListElement() {
        return document.querySelector('[class*="orderList"], [class*="_orderList_"]');
    },

    getOrderItems(orderList) {
        if (!orderList) return [];
        return orderList.querySelectorAll('[class*="orderItem"], [class*="_orderItem_"], li');
    },

    getSelectAllCheckbox(header) {
        const root = header || document;
        return root.querySelector('[class*="selectAllCheckbox"], [class*="_selectAllCheckbox_"]') || root.querySelector('input[type="checkbox"]');
    },

    addDeleteAllButton() {
        const header = this.getHeaderElement();
        if (!header) return;

        if (header.querySelector('.ghn-delete-all-btn')) return;

        const actionHeader = document.createElement('span');
        actionHeader.className = 'ghn-delete-action-header';
        actionHeader.style.width = '30%';
        actionHeader.style.display = 'flex';
        actionHeader.style.justifyContent = 'end';
        actionHeader.style.alignItems = 'center';

        const deleteAllButton = document.createElement('button');
        deleteAllButton.type = 'button';
        deleteAllButton.className = 'ghn-delete-all-btn';
        deleteAllButton.style.backgroundColor = '#FF5500';
        deleteAllButton.style.border = 'none';
        deleteAllButton.style.borderRadius = '8px';
        deleteAllButton.style.color = '#ffffff';
        deleteAllButton.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
        deleteAllButton.style.fontSize = '14px';
        deleteAllButton.style.fontWeight = '500';
        deleteAllButton.style.padding = '8px 18px';
        deleteAllButton.style.cursor = 'pointer';
        deleteAllButton.style.transition = 'all 0.2s ease';
        deleteAllButton.style.boxShadow = '0 2px 6px rgba(255, 85, 0, 0.25)';
        deleteAllButton.style.outline = 'none';

        deleteAllButton.onmouseover = () => { deleteAllButton.style.backgroundColor = '#e04800'; };
        deleteAllButton.onmouseout = () => { deleteAllButton.style.backgroundColor = '#FF5500'; };

        deleteAllButton.innerHTML = '<span>Xóa tất cả</span>';

        actionHeader.appendChild(deleteAllButton);
        header.appendChild(actionHeader);

        const self = this;
        deleteAllButton.addEventListener('click', function() {
            const orderList = self.getOrderListElement();
            if (!orderList) return;

            const rows = self.getOrderItems(orderList);
            const selectedRows = Array.from(rows).filter(row => {
                const checkbox = row.querySelector('input[type="checkbox"]');
                return checkbox && checkbox.checked;
            });

            if (selectedRows.length === 0) {
                alert('Vui lòng chọn ít nhất một đơn hàng để xóa.');
                return;
            }

            if (confirm('Bạn có chắc chắn muốn xóa tất cả các đơn hàng đã chọn khỏi danh sách?')) {
                selectedRows.forEach(row => {
                    const deleteButton = row.querySelector('button.ant-btn') || row.querySelector('button');
                    if (deleteButton) {
                        deleteButton.click(); 
                    }
                });

                if (orderList.children.length === 0) {
                    const emptyItem = document.createElement('li');
                    emptyItem.className = 'orderItem-empty';
                    emptyItem.style.textAlign = 'center';
                    emptyItem.textContent = 'Không còn đơn hàng nào trong danh sách.';
                    orderList.appendChild(emptyItem);
                }

                const selectAllCheckbox = self.getSelectAllCheckbox(header);
                if (selectAllCheckbox) selectAllCheckbox.checked = false;
            }
        });
    },

    enableCheckboxes() {
        const orderList = this.getOrderListElement();
        if (!orderList) return;

        const checkboxes = orderList.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            if (checkbox.disabled) {
                checkbox.removeAttribute('disabled');
            }
        });

        const header = this.getHeaderElement();
        const selectAllCheckbox = this.getSelectAllCheckbox(header);
        if (selectAllCheckbox) {
            if (selectAllCheckbox.disabled) {
                selectAllCheckbox.removeAttribute('disabled');
            }

            if (!selectAllCheckbox.hasAttribute('data-ghn-listener')) {
                selectAllCheckbox.setAttribute('data-ghn-listener', 'true');
                selectAllCheckbox.addEventListener('change', function() {
                    const isChecked = this.checked;
                    checkboxes.forEach(checkbox => {
                        checkbox.checked = isChecked;
                        if (checkbox.disabled) checkbox.removeAttribute('disabled');
                    });
                });
            }
        }
    },

    monitorCheckboxes() {
        const orderList = this.getOrderListElement();
        if (orderList) {
            const checkboxes = orderList.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(checkbox => {
                if (checkbox.disabled) {
                    checkbox.removeAttribute('disabled');
                }
            });
        }
        
        const header = this.getHeaderElement();
        const selectAllCheckbox = this.getSelectAllCheckbox(header);
        if (selectAllCheckbox && selectAllCheckbox.disabled) {
            selectAllCheckbox.removeAttribute('disabled');
        }
    },

    start() {
        this.isRunning = true;
        
        this.enableCheckboxes();
        this.addDeleteAllButton();

        if (!this.monitorInterval) {
            this.monitorInterval = setInterval(() => this.monitorCheckboxes(), 1000);
        }

        if (!this.observer) {
            this.observer = new MutationObserver((mutationsList) => {
                for (const mutation of mutationsList) {
                    if (mutation.type === 'childList') {
                        const header = this.getHeaderElement();
                        if (header && !document.querySelector('.ghn-delete-all-btn')) {
                            this.enableCheckboxes();
                            this.addDeleteAllButton();
                        }
                    }
                }
            });
        }

        const targetNode = document.body;
        if (!targetNode) {
            console.warn("GHN Helper Pro: [BulkDelete] document.body chưa sẵn sàng, hoãn observe.");
            return;
        }
        this.observer.observe(targetNode, { childList: true, subtree: true });
    },

    stop() {
        this.isRunning = false;
        
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }

        if (this.observer) {
            this.observer.disconnect();
        }

        // Cleanup injected UI
        const actionHeader = document.querySelector('.ghn-delete-action-header');
        if (actionHeader) {
            actionHeader.remove();
        }
    }
};

// Register module
if (window.GHNConfigManager) {
    window.GHNConfigManager.registerFeature(BulkDeleteFeature.id, BulkDeleteFeature);
}
