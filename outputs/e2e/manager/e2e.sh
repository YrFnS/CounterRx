#!/bin/bash
# E2E test script for manager user
cd /home/user/CounterRx || cd /dev/stdin

# Already logged in as K. Asante (manager)
# Take screenshots of all permitted views
agent-browser screenshot outputs/e2e/manager/01-login-success.png
agent-browser screenshot outputs/e2e/manager/02-dashboard.png

# Navigate to Customers
agent-browser find text "Customers" click
agent-browser wait --load networkidle
agent-browser screenshot outputs/e2e/manager/03-customers.png

# Navigate to Inventory
agent-browser find text "Inventory" click
agent-browser wait --load networkidle
agent-browser screenshot outputs/e2e/manager/04-inventory.png

# Navigate to Deliveries
agent-browser find text "Deliveries" click
agent-browser wait --load networkidle
agent-browser screenshot outputs/e2e/manager/05-deliveries.png

# Navigate to History
agent-browser find text "History" click
agent-browser wait --load networkidle
agent-browser screenshot outputs/e2e/manager/06-history.png

# Navigate to Reports
agent-browser find text "Reports" click
agent-browser wait --load networkidle
agent-browser screenshot outputs/e2e/manager/07-reports.png

# Navigate to Finance
agent-browser find text "Finance" click
agent-browser wait --load networkidle
agent-browser screenshot outputs/e2e/manager/08-finance.png

# Navigate to Reports -> Till tab
agent-browser find text "Reports" click
agent-browser wait --load networkidle
agent-browser screenshot outputs/e2e/manager/07b-reports-till.png

# Navigate to Reports -> Title (Analytics) tab
agent-browser find text "Title" click
agent-browser wait --load networkidle
agent-browser screenshot outputs/e2e/manager/09-reports-analytics.png

# Finance -> Expenses
agent-browser find text "Finance" click
agent-browser wait --load networkidle
agent-browser screenshot outputs/e2e/manager/10-finance-expenses.png

# Finance -> AP Invoices
agent-browser find text "Accounts Payable" click
agent-browser wait --load networkidle
agent-browser screenshot outputs/e2e/manager/11-finance-ap-invoices.png

# Add product to cart
agent-browser find text "Paracetamol 500mg" click
agent-browser screenshot outputs/e2e/manager/12-cart-with-item.png

# Till & Reports
agent-browser find text "Till & Reports" click
agent-browser wait --load networkidle
agent-browser screenshot outputs/e2e/manager/13-till-reports.png
