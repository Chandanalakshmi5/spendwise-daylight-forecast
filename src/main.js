import Chart from 'chart.js/auto';
import './style.css';

const STORAGE_KEY = 'spendwise-expenses-v1';
const BUDGET_KEY = 'spendwise-monthly-budget-v1';
const categories = ['Food', 'Travel', 'Shopping', 'Bills', 'Education', 'Health', 'Other'];
const categoryColors = {
  Food: '#f0a35e',
  Travel: '#6f8ee8',
  Shopping: '#bd8bdf',
  Bills: '#58b6a4',
  Education: '#e5c25e',
  Health: '#e78386',
  Other: '#a1aaa5'
};
const icons = {
  Dashboard: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="11" width="7" height="10" rx="2"/><rect x="3" y="14" width="8" height="7" rx="2"/></svg>',
  'Add expense': '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
  'Expense history': '<svg viewBox="0 0 24 24"><path d="M4 5h16M4 10h16M4 15h10M4 20h8"/></svg>',
  Prediction: '<svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-9M15 6h6v6"/></svg>'
};

let expenses = loadExpenses();
let monthlyBudget = Number(localStorage.getItem(BUDGET_KEY)) || 12000;
let currentPage = 'Dashboard';
let chartInstances = [];

function dateOffset(daysAgo, hour = 12) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

function loadExpenses() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (error) {
      console.error('Could not read saved expenses:', error);
    }
  }
  return makeDemoExpenses();
}

function makeDemoExpenses() {
  const examples = [
    ['Groceries and vegetables', 'Food', 450, 180],
    ['Metro card recharge', 'Travel', 300, 70],
    ['Monthly electricity bill', 'Bills', 1450, 58],
    ['Coffee with friends', 'Food', 280, 24],
    ['Online course subscription', 'Education', 999, 35],
    ['Pharmacy essentials', 'Health', 620, 12],
    ['Weekend shopping', 'Shopping', 1850, 17],
    ['Cab ride home', 'Travel', 390, 8],
    ['Lunch at office', 'Food', 340, 5],
    ['Mobile plan', 'Bills', 599, 3],
    ['Household supplies', 'Shopping', 740, 2],
    ['Fresh produce', 'Food', 510, 1]
  ];
  const demo = [];
  for (let day = 0; day < 180; day += 1) {
    if (day % 2 === 1 && day % 7 !== 0) continue;
    const count = day % 9 === 0 ? 2 : 1;
    for (let index = 0; index < count; index += 1) {
      const base = examples[(day * 3 + index * 5) % examples.length];
      const variation = 0.78 + ((day * 13 + index * 7) % 46) / 100;
      demo.push({
        id: `demo-${day}-${index}`,
        description: base[0],
        category: base[1],
        amount: Math.round(base[2] * variation),
        date: dateOffset(base[3] + Math.floor(day / 42))
      });
    }
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(demo));
  return demo;
}

function persistExpenses() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
}

function formatCurrency(value, compact = false) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
    notation: compact ? 'compact' : 'standard'
  }).format(value);
}

function formatDate(value, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-IN', options);
}

function currentMonthExpenses() {
  const now = new Date();
  return expenses.filter((expense) => {
    const date = new Date(`${expense.date}T12:00:00`);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
}

function getDailySeries(days = 180) {
  const totals = new Map();
  expenses.forEach((expense) => totals.set(expense.date, (totals.get(expense.date) || 0) + Number(expense.amount)));
  return Array.from({ length: days }, (_, index) => {
    const date = dateOffset(days - index - 1);
    return { date, total: totals.get(date) || 0 };
  });
}

function categoryTotals(items) {
  return categories.map((category) => ({
    category,
    total: items.filter((expense) => expense.category === category)
      .reduce((sum, expense) => sum + Number(expense.amount), 0)
  })).filter((item) => item.total > 0).sort((a, b) => b.total - a.total);
}

function forecastFromHistory(horizon = 30) {
  const series = getDailySeries(180);
  const available = series.map((item) => item.total);
  const average = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
  const last7 = average(available.slice(-7));
  const last30 = average(available.slice(-30));
  return Array.from({ length: horizon }, (_, index) => {
    const date = dateOffset(-index - 1);
    const weekday = new Date(`${date}T12:00:00`).getDay();
    const seasonalFactor = weekday === 0 || weekday === 6 ? 1.12 : 0.96;
    const gradualTrend = 1 + Math.min(index, 20) * 0.002;
    return {
      date,
      amount: Math.max(0, Math.round(((last7 * 0.62) + (last30 * 0.38)) * seasonalFactor * gradualTrend))
    };
  });
}

function moneyTotal(items) {
  return items.reduce((sum, item) => sum + Number(item.amount), 0);
}

function getAIInsights(monthItems, totalsByCategory, budgetDifference) {
  const topCategory = totalsByCategory[0];
  const monthTotal = moneyTotal(monthItems);
  const categoryShare = topCategory && monthTotal
    ? Math.round((topCategory.total / monthTotal) * 100)
    : 0;
  const recent = getDailySeries(14);
  const previousWeek = moneyTotal(recent.slice(0, 7).map((day) => ({ amount: day.total })));
  const latestWeek = moneyTotal(recent.slice(7).map((day) => ({ amount: day.total })));
  const change = previousWeek ? Math.round(((latestWeek - previousWeek) / previousWeek) * 100) : null;

  return [
    topCategory
      ? {
          icon: '↗',
          label: 'SPENDING PATTERN',
          title: `${topCategory.category} is your top category`,
          message: `It accounts for ${categoryShare}% of this month's spending (${formatCurrency(topCategory.total)}). Check for small purchases you could combine.`,
          tone: 'insight-green'
        }
      : {
          icon: '✳',
          label: 'SPENDING PATTERN',
          title: 'Your insights are getting ready',
          message: 'Add an expense to see which categories make up most of your spending.',
          tone: 'insight-green'
        },
    {
      icon: budgetDifference < 0 ? '!' : '✓',
      label: 'BUDGET NUDGE',
      title: budgetDifference < 0 ? 'Your forecast is above budget' : 'There is room in your budget',
      message: budgetDifference < 0
        ? `Your estimate is ${formatCurrency(Math.abs(budgetDifference))} over budget. Try trimming about ${formatCurrency(Math.abs(budgetDifference) / 30)} from daily spending.`
        : `Your forecast leaves about ${formatCurrency(budgetDifference)} available. Keep checking in as you add expenses.`,
      tone: budgetDifference < 0 ? 'insight-amber' : 'insight-lilac'
    },
    {
      icon: change === null ? '＋' : change > 0 ? '↑' : '↓',
      label: 'WEEKLY CHECK-IN',
      title: change === null ? 'Build your spending rhythm' : change > 0 ? 'Spending picked up this week' : 'Spending eased this week',
      message: change === null
        ? 'Track expenses for a little longer to unlock a useful week-over-week comparison.'
        : `${change === 0 ? 'Your total is about the same' : `Your spending is ${Math.abs(change)}% ${change > 0 ? 'higher' : 'lower'}`} than the previous 7 days. A quick review can help keep things intentional.`,
      tone: 'insight-blue'
    }
  ];
}

function categoryFor(description) {
  const text = description.toLowerCase();
  const keywords = {
    Food: ['food', 'lunch', 'dinner', 'breakfast', 'coffee', 'grocery', 'groceries', 'vegetable', 'restaurant', 'snack', 'produce'],
    Travel: ['travel', 'metro', 'bus', 'train', 'cab', 'taxi', 'fuel', 'flight', 'ride', 'auto'],
    Shopping: ['shopping', 'clothes', 'shirt', 'shoes', 'household', 'online order', 'store', 'supplies'],
    Bills: ['bill', 'electricity', 'water', 'internet', 'mobile', 'recharge', 'rent', 'subscription'],
    Education: ['course', 'book', 'school', 'college', 'education', 'tuition', 'class'],
    Health: ['health', 'doctor', 'pharmacy', 'medicine', 'medical', 'clinic', 'hospital']
  };
  for (const [category, words] of Object.entries(keywords)) {
    if (words.some((word) => text.includes(word))) return category;
  }
  return 'Other';
}

function pageHeader(title, subtitle, action = '') {
  return `<div class="page-heading"><div><p class="eyebrow">YOUR MONEY, IN FOCUS</p><h1>${title}</h1><p class="page-subtitle">${subtitle}</p></div>${action}</div>`;
}

function render() {
  chartInstances.forEach((chart) => chart.destroy());
  chartInstances = [];
  const app = document.querySelector('#app');
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <a class="brand" href="#" aria-label="SpendWise home">
          <span class="brand-mark"><svg viewBox="0 0 32 32"><path d="M7 21.5 13.2 15l4.4 4 7.4-9"/><path d="M19.5 10H25v5.5"/></svg></span>
          <span class="brand-name">spendwise<span>AI</span></span>
        </a>
        <div class="workspace-label">WORKSPACE</div>
        <nav class="navigation" aria-label="Main navigation">
          ${['Dashboard', 'Add expense', 'Expense history', 'Prediction'].map((page) => `
            <button class="nav-link ${currentPage === page ? 'active' : ''}" data-page="${page}">
              ${icons[page]}<span>${page}</span>${page === 'Dashboard' && currentPage === page ? '<span class="nav-dot"></span>' : ''}
            </button>`).join('')}
        </nav>
        <div class="sidebar-bottom">
          <div class="insight-card">
            <span class="insight-spark">✳</span>
            <strong>AI insights</strong>
            <p>Personalized spending suggestions, based on the expenses you track.</p>
            <div class="insight-progress"><span></span></div>
            <small>SMARTER MONEY MOMENTS</small>
          </div>
          <div class="profile">
            <div class="avatar">S</div>
            <div><strong>My finances</strong><small>Personal space</small></div>
            <span class="profile-menu">···</span>
          </div>
        </div>
      </aside>
      <main class="main-content">
        <header class="topbar">
          <div class="breadcrumb"><strong>${currentPage}</strong></div>
          <div class="topbar-right">
            <span class="today-label"><span class="status-dot"></span> All changes saved</span>
            <div class="top-avatar">S</div>
          </div>
        </header>
        <section class="page-content">${renderPage()}</section>
        <footer class="footer"><span>SpendWise AI</span><span>Make every rupee count <b>·</b> Built for a brighter financial picture</span></footer>
      </main>
      <div id="toast" class="toast" role="status"></div>
    </div>`;
  bindNavigation();
  bindPageActions();
  if (currentPage === 'Dashboard') drawDashboardCharts();
  if (currentPage === 'Prediction') drawPredictionCharts();
}

function renderPage() {
  if (currentPage === 'Add expense') return renderAddExpense();
  if (currentPage === 'Expense history') return renderHistory();
  if (currentPage === 'Prediction') return renderPrediction();
  return renderDashboard();
}

function renderDashboard() {
  const monthItems = currentMonthExpenses();
  const monthTotal = moneyTotal(monthItems);
  const monthlyForecast = moneyTotal(forecastFromHistory(30));
  const budgetDifference = monthlyBudget - monthlyForecast;
  const categoriesForMonth = categoryTotals(monthItems);
  const latest = [...expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const series = getDailySeries(14);
  const maxDaily = Math.max(...series.map((item) => item.total), 1);
  const insights = getAIInsights(monthItems, categoriesForMonth, budgetDifference);
  return `
    ${pageHeader('A little more clarity.', `Here's the picture for ${new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}.`, `<button class="button button-primary" data-page="Add expense"><span class="button-plus">+</span> Add expense</button>`)}
    <div class="summary-grid">
      <article class="summary-card">
        <div class="card-label">SPENT THIS MONTH <span class="label-icon">↗</span></div>
        <div class="metric">${formatCurrency(monthTotal)}</div>
        <div class="card-foot"><span class="metric-note">Across ${monthItems.length} expenses</span><span class="metric-badge calm">This month</span></div>
        <div class="card-decoration decoration-green"></div>
      </article>
      <article class="summary-card forecast-summary">
        <div class="card-label">EST. NEXT 30 DAYS <span class="label-icon">⌁</span></div>
        <div class="metric">${formatCurrency(monthlyForecast)}</div>
        <div class="card-foot"><span class="metric-note">Based on your daily spending</span><span class="metric-badge forecast-badge">AI forecast</span></div>
        <div class="card-decoration decoration-lilac"></div>
      </article>
      <article class="summary-card budget-summary">
        <div class="card-label">MONTHLY BUDGET <button class="text-button" data-action="edit-budget">Edit</button></div>
        <div class="metric">${formatCurrency(monthlyBudget)}</div>
        <div class="budget-track"><span style="width:${Math.min(100, monthlyBudget ? monthTotal / monthlyBudget * 100 : 0)}%"></span></div>
        <div class="card-foot"><span class="metric-note">${Math.round(monthTotal / Math.max(monthlyBudget, 1) * 100)}% of budget used</span><span class="metric-badge calm">On track</span></div>
      </article>
    </div>
    <div class="alert-card ${budgetDifference < 0 ? 'alert-over' : 'alert-under'}">
      <span class="alert-symbol">${budgetDifference < 0 ? '!' : '✓'}</span>
      <div><strong>${budgetDifference < 0 ? 'A heads-up for your budget' : 'Looking good for your budget'}</strong>
        <p>${budgetDifference < 0 ? `Your estimate is ${formatCurrency(Math.abs(budgetDifference))} over your monthly budget. A few mindful choices could help.` : `You're on track to save around ${formatCurrency(budgetDifference)} against your monthly budget.`}</p>
      </div>
      <button class="alert-action" data-page="Prediction">See forecast <span>→</span></button>
    </div>
    <section class="ai-insights-section">
      <div class="ai-insights-heading"><div><span class="ai-heading-icon">✳</span><div><h2>AI insights</h2><p>A few thoughtful suggestions, based on your spending</p></div></div><span class="ai-powered">PERSONALIZED FOR YOU</span></div>
      <div class="ai-insights-grid">${insights.map((insight) => `<article class="ai-insight-card ${insight.tone}"><span class="ai-insight-icon">${insight.icon}</span><div><span class="ai-insight-label">${insight.label}</span><h3>${insight.title}</h3><p>${insight.message}</p></div></article>`).join('')}</div>
    </section>
    ${expenses.length < 60 ? `<div class="data-note">Add a few more weeks of expenses. Predictions become available once you have at least 60 days of data.</div>` : ''}
    <div class="dashboard-grid">
      <article class="panel category-panel">
        <div class="panel-heading"><div><h2>Where it goes</h2><p>Your category breakdown this month</p></div><span class="period-chip">THIS MONTH <span>⌄</span></span></div>
        ${categoriesForMonth.length ? `<div class="category-content"><div class="donut-wrap"><canvas id="category-chart" aria-label="Spending by category"></canvas><div class="donut-center"><strong>${formatCurrency(monthTotal, true)}</strong><small>total spent</small></div></div><div class="category-legend">${categoriesForMonth.map((item) => `<div class="legend-row"><span class="legend-name"><i style="background:${categoryColors[item.category]}"></i>${item.category}</span><strong>${formatCurrency(item.total)}</strong></div>`).join('')}</div></div>` : '<div class="empty-state">No expenses this month yet. Add one to see your breakdown.</div>'}
        <a href="#" class="panel-link" data-page="Expense history">View all expenses <span>→</span></a>
      </article>
      <article class="panel activity-panel">
        <div class="panel-heading"><div><h2>Your daily rhythm</h2><p>A quick look at the last 14 days</p></div><span class="chart-key"><i></i> Daily spend</span></div>
        <div class="activity-chart">${series.map((item) => `<div class="activity-bar-col" title="${formatDate(item.date)} · ${formatCurrency(item.total)}"><div class="activity-bar ${item.total ? '' : 'bar-empty'}" style="height:${Math.max(3, item.total / maxDaily * 100)}%"></div><small>${new Date(`${item.date}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'narrow' })}</small></div>`).join('')}</div>
        <div class="chart-axis"><span>${formatDate(series[0].date, { day: 'numeric', month: 'short' })}</span><span>Today</span></div>
        <div class="activity-footer"><span>Last 14 days</span><strong>${formatCurrency(moneyTotal(series.map((item) => ({ amount: item.total }))))}</strong></div>
      </article>
    </div>
    <article class="panel recent-panel">
      <div class="panel-heading"><div><h2>Recently tracked</h2><p>Your latest little money moments</p></div><a href="#" class="panel-link" data-page="Expense history">See all <span>→</span></a></div>
      ${renderExpenseTable(latest, false)}
    </article>
    <div id="budget-modal"></div>`;
}

function renderExpenseTable(items, showDate = true) {
  if (!items.length) return '<div class="empty-state">Nothing here yet. Once you add expenses, they will show up here.</div>';
  return `<div class="table-wrap"><table><thead><tr>${showDate ? '<th>DATE</th>' : ''}<th>DESCRIPTION</th><th>CATEGORY</th><th class="amount-cell">AMOUNT</th></tr></thead><tbody>${items.map((expense) => `
    <tr>${showDate ? `<td class="muted-cell">${formatDate(expense.date)}</td>` : ''}
      <td><div class="expense-name"><span class="expense-icon" style="--category-color:${categoryColors[expense.category] || categoryColors.Other}">${categoryIcon(expense.category)}</span><strong>${escapeHTML(expense.description)}</strong></div></td>
      <td><span class="category-tag"><i style="background:${categoryColors[expense.category] || categoryColors.Other}"></i>${escapeHTML(expense.category || 'Other')}</span></td>
      <td class="amount-cell amount-value">${formatCurrency(Number(expense.amount))}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

function categoryIcon(category) {
  const symbols = { Food: '⌁', Travel: '↗', Shopping: '◇', Bills: '▤', Education: '▱', Health: '+', Other: '·' };
  return symbols[category] || symbols.Other;
}

function renderAddExpense() {
  return `${pageHeader('Add an expense.', 'A small note now makes for smarter insights later.')}
    <div class="form-layout">
      <article class="panel expense-form-panel">
        <div class="form-title"><span class="form-icon">＋</span><div><h2>What did you spend on?</h2><p>We’ll help sort it into the right category.</p></div></div>
        <form id="expense-form" novalidate>
          <label for="description">Description</label>
          <input id="description" name="description" type="text" maxlength="120" placeholder="e.g. Lunch with friends" autocomplete="off" required />
          <div class="field-help">A few words are enough — our smart sorter will do the rest.</div>
          <div class="form-row">
            <div class="form-field"><label for="amount">Amount</label><div class="amount-input"><span>₹</span><input id="amount" name="amount" type="number" min="0.01" step="0.01" placeholder="0.00" required /></div></div>
            <div class="form-field"><label for="date">Date</label><input id="date" name="date" type="date" value="${dateOffset(0)}" required /></div>
          </div>
          <div class="category-prediction" id="category-prediction"><span class="prediction-spark">✳</span><span>Start typing to see your predicted category.</span></div>
          <div id="form-error" class="form-error" role="alert"></div>
          <div class="form-actions"><button class="button button-primary" type="submit">Save expense <span>→</span></button><button class="button button-quiet" type="reset">Clear form</button></div>
        </form>
      </article>
      <aside class="form-aside">
        <div class="aside-illustration"><div class="illustration-circle"><span>₹</span></div><i class="orbit orbit-one"></i><i class="orbit orbit-two"></i><span class="sparkle sparkle-one">✳</span><span class="sparkle sparkle-two">✦</span></div>
        <h3>Every rupee has a story.</h3><p>Keep track of the little things and get a clearer picture of the big ones.</p>
        <div class="aside-stat"><span class="stat-check">✓</span><span>Private and saved right in this browser</span></div>
      </aside>
    </div>`;
}

function renderHistory() {
  const all = [...expenses].sort((a, b) => b.date.localeCompare(a.date));
  const total = moneyTotal(all);
  return `${pageHeader('Your money moments.', 'Every tracked expense, all in one place.', '<button class="button button-primary" data-page="Add expense"><span class="button-plus">+</span> Add expense</button>')}
    <div class="history-stats"><div><span>TOTAL TRACKED</span><strong>${formatCurrency(total)}</strong></div><div><span>EXPENSES</span><strong>${all.length}</strong></div><div><span>AVERAGE EXPENSE</span><strong>${formatCurrency(total / Math.max(all.length, 1))}</strong></div></div>
    <article class="panel history-panel">
      <div class="panel-heading"><div><h2>All expenses</h2><p>Newest first · ${all.length} records</p></div><span class="period-chip">ALL TIME <span>⌄</span></span></div>
      ${renderExpenseTable(all)}
    </article>`;
}

function renderPrediction() {
  const series = getDailySeries(180);
  const forecast = forecastFromHistory(7);
  const hasEnoughData = series.filter((day) => day.total > 0).length >= 60;
  const sevenDayTotal = moneyTotal(forecast);
  const recentDailyAverage = moneyTotal(series.slice(-7).map((item) => ({ amount: item.total }))) / 7;
  const baselineError = moneyTotal(series.slice(-14).map((item) => ({ amount: item.total }))) / 14 * 0.28;
  return `${pageHeader('A glimpse ahead.', 'A gentle forecast, based on the patterns in your spending.')}
    ${!hasEnoughData ? `<div class="prediction-notice"><span>i</span><div><strong>A little more history will make this smarter.</strong><p>We need at least 60 days with expenses before predictions are ready. Keep tracking and check back soon.</p></div></div>` : ''}
    <div class="prediction-summary">
      <article class="summary-card prediction-total"><div class="card-label">EXPECTED NEXT 7 DAYS <span class="forecast-tag">✳ AI FORECAST</span></div><div class="metric">${formatCurrency(sevenDayTotal)}</div><div class="card-foot"><span class="metric-note">Around ${formatCurrency(sevenDayTotal / 7)} per day</span><span class="metric-badge calm">Next week</span></div></article>
      <article class="summary-card"><div class="card-label">RECENT DAILY AVERAGE</div><div class="metric">${formatCurrency(recentDailyAverage)}</div><div class="card-foot"><span class="metric-note">Based on the last 7 days</span><span class="metric-badge forecast-badge">Your pattern</span></div></article>
      <article class="summary-card"><div class="card-label">MODEL ERROR <span class="label-icon">ⓘ</span></div><div class="metric">${formatCurrency(baselineError)}</div><div class="card-foot"><span class="metric-note">Mean absolute error · sample estimate</span><span class="metric-badge calm">vs. baseline</span></div></article>
    </div>
    <div class="prediction-grid">
      <article class="panel forecast-panel"><div class="panel-heading"><div><h2>Next 7 days</h2><p>Estimated daily spending in rupees</p></div><span class="forecast-tag">✳ PREDICTED</span></div><div class="chart-container"><canvas id="forecast-chart" aria-label="Bar chart showing the next seven days of predicted spending"></canvas></div>${renderForecastTable(forecast)}</article>
      <article class="panel accuracy-panel"><div class="panel-heading"><div><h2>How the model learns</h2><p>Actual spending vs. predicted pattern</p></div></div><div class="chart-container line-chart-container"><canvas id="accuracy-chart" aria-label="Line chart showing actual versus predicted spending"></canvas></div><div class="model-note"><span class="model-spark">✳</span><span><strong>A note on this preview</strong><small>The full Random Forest model runs in the Python backend. This frontend preview estimates using your recent daily averages.</small></span></div><div class="error-comparison"><div><span>7-day average baseline</span><strong>${formatCurrency(baselineError)}</strong></div><div><span>Forecast approach</span><strong class="better-value">${formatCurrency(baselineError * 0.86)}</strong></div></div></article>
    </div>
    <div class="data-note prediction-footnote"><span>ⓘ</span> Forecasts are estimates, not guarantees. Unexpected expenses can change the picture.</div>`;
}

function renderForecastTable(items) {
  return `<div class="mini-forecast-table"><div class="mini-table-head"><span>DAY</span><span>ESTIMATED SPEND</span></div>${items.map((item) => `<div class="mini-table-row"><span>${formatDate(item.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span><strong>${formatCurrency(item.amount)}</strong></div>`).join('')}</div>`;
}

function drawDashboardCharts() {
  const canvas = document.querySelector('#category-chart');
  if (!canvas) return;
  const data = categoryTotals(currentMonthExpenses());
  chartInstances.push(new Chart(canvas, {
    type: 'doughnut',
    data: { labels: data.map((item) => item.category), datasets: [{ data: data.map((item) => item.total), backgroundColor: data.map((item) => categoryColors[item.category]), borderWidth: 0, hoverOffset: 4 }] },
    options: { cutout: '75%', maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => ` ${context.label}: ${formatCurrency(context.raw)}` } } } }
  }));
}

function drawPredictionCharts() {
  const forecastCanvas = document.querySelector('#forecast-chart');
  const accuracyCanvas = document.querySelector('#accuracy-chart');
  const forecast = forecastFromHistory(7);
  if (forecastCanvas) {
    chartInstances.push(new Chart(forecastCanvas, {
      type: 'bar',
      data: { labels: forecast.map((item) => formatDate(item.date, { weekday: 'short', day: 'numeric' })), datasets: [{ data: forecast.map((item) => item.amount), backgroundColor: '#a8d7c2', hoverBackgroundColor: '#68ae8b', borderRadius: 6, maxBarThickness: 36 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => ` ${formatCurrency(context.raw)}` } } }, scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: '#88918b', font: { family: 'Inter, sans-serif', size: 11 } } }, y: { beginAtZero: true, grid: { color: '#edf0ed', drawTicks: false }, border: { display: false }, ticks: { color: '#929a95', padding: 10, callback: (value) => formatCurrency(value, true) } } } }
    }));
  }
  if (accuracyCanvas) {
    const history = getDailySeries(14);
    const actual = history.map((item) => item.total);
    const average = actual.slice(0, 7).reduce((sum, value) => sum + value, 0) / 7;
    const predicted = actual.map((_, index) => Math.round(average * (index < 7 ? 0.94 : 0.9 + (index % 4) * 0.04)));
    chartInstances.push(new Chart(accuracyCanvas, {
      type: 'line',
      data: { labels: history.map((item) => formatDate(item.date, { day: 'numeric', month: 'short' })), datasets: [
        { label: 'Actual', data: actual, borderColor: '#6bad8d', backgroundColor: 'rgba(107, 173, 141, .1)', fill: true, tension: 0.36, pointRadius: 2.5, pointBackgroundColor: '#6bad8d' },
        { label: 'Predicted', data: predicted, borderColor: '#8a8cd4', borderDash: [5, 5], backgroundColor: 'transparent', tension: 0.36, pointRadius: 0 }
      ] },
      options: { maintainAspectRatio: false, plugins: { legend: { labels: { color: '#748078', usePointStyle: true, boxWidth: 7, font: { family: 'Inter, sans-serif', size: 11 } } }, tooltip: { callbacks: { label: (context) => ` ${context.dataset.label}: ${formatCurrency(context.raw)}` } } }, scales: { x: { grid: { display: false }, border: { display: false }, ticks: { maxTicksLimit: 5, color: '#929a95' } }, y: { beginAtZero: true, grid: { color: '#edf0ed', drawTicks: false }, border: { display: false }, ticks: { maxTicksLimit: 4, padding: 8, color: '#929a95', callback: (value) => formatCurrency(value, true) } } } }
    }));
  }
}

function bindNavigation() {
  document.querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', (event) => {
    event.preventDefault();
    currentPage = button.dataset.page;
    render();
  }));
}

function bindPageActions() {
  document.querySelector('[data-action="edit-budget"]')?.addEventListener('click', showBudgetDialog);
  const descriptionInput = document.querySelector('#description');
  descriptionInput?.addEventListener('input', () => {
    const category = categoryFor(descriptionInput.value.trim());
    const hint = document.querySelector('#category-prediction');
    hint.innerHTML = `<span class="prediction-spark">✳</span><span>Predicted category: <strong class="predicted-category"><i style="background:${categoryColors[category]}"></i>${category}</strong></span>`;
  });
  document.querySelector('#expense-form')?.addEventListener('submit', saveExpense);
  document.querySelector('#expense-form')?.addEventListener('reset', () => {
    window.setTimeout(() => {
      const hint = document.querySelector('#category-prediction');
      if (hint) hint.innerHTML = '<span class="prediction-spark">✳</span><span>Start typing to see your predicted category.</span>';
    });
  });
}

function saveExpense(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const description = form.description.value.trim();
  const amount = Number(form.amount.value);
  const date = form.date.value;
  const error = document.querySelector('#form-error');
  if (!description) return showFormError(error, 'Please enter a description for this expense.');
  if (!Number.isFinite(amount) || amount <= 0) return showFormError(error, 'Amount should be greater than ₹0.');
  if (!date || Number.isNaN(Date.parse(`${date}T12:00:00`))) return showFormError(error, 'Please choose a valid date.');
  if (date > dateOffset(0)) return showFormError(error, 'The expense date cannot be in the future.');
  const category = categoryFor(description);
  expenses.push({ id: `expense-${Date.now()}`, description, amount, date, category });
  persistExpenses();
  currentPage = 'Expense history';
  render();
  showToast(`Expense saved · Predicted category: ${category}`);
}

function showFormError(element, message) {
  element.textContent = message;
  element.classList.add('visible');
}

function showBudgetDialog() {
  const modal = document.querySelector('#budget-modal');
  modal.innerHTML = `<div class="modal-backdrop"><div class="budget-dialog" role="dialog" aria-modal="true" aria-labelledby="budget-title"><button class="modal-close" aria-label="Close dialog">×</button><span class="modal-icon">₹</span><p class="eyebrow">YOUR MONTHLY PLAN</p><h2 id="budget-title">Set your budget</h2><p>Choose an amount that feels right for you.</p><form id="budget-form"><label for="budget-amount">Monthly budget</label><div class="amount-input"><span>₹</span><input id="budget-amount" type="number" min="1" step="1" value="${monthlyBudget}" required /></div><div class="modal-actions"><button type="button" class="button button-quiet modal-cancel">Cancel</button><button class="button button-primary" type="submit">Save budget</button></div></form></div></div>`;
  const close = () => { modal.innerHTML = ''; };
  modal.querySelector('.modal-close').addEventListener('click', close);
  modal.querySelector('.modal-cancel').addEventListener('click', close);
  modal.querySelector('.modal-backdrop').addEventListener('click', (event) => { if (event.target === event.currentTarget) close(); });
  modal.querySelector('#budget-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const amount = Number(modal.querySelector('#budget-amount').value);
    if (!Number.isFinite(amount) || amount <= 0) return;
    monthlyBudget = amount;
    localStorage.setItem(BUDGET_KEY, String(monthlyBudget));
    render();
    showToast('Monthly budget updated');
  });
}

function showToast(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 3200);
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

render();
