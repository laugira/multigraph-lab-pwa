// MultiGraph Lab — IHM responsive (sidebar à onglets)

let cy = null;
let linkSourceNode = null;
let linkPickFocus = 'source';
let selectedElement = null;
let knownRelTypes = new Set();
let knownEntityTypes = new Set(['Person']);
const knownRelTypeMeta = new Map();
let confirmCallback = null;
let selectionSnapshot = null;

let sidebarTab = 'create';
let sidebarOverlayOpen = false;
let createSubTab = 'entity';
let entityFormSection = null;
let relFormSection = null;
let formsInitialized = false;

const historyState = { undoStack: [], redoStack: [], maxSize: 50, applying: false };

const THEME_STORAGE_KEY = 'multigraph-theme';
const POSITIONS_STORAGE_KEY = 'multigraph-node-positions';
const FOCUS_ON_SELECT_KEY = 'multigraph-focus-on-select';
const CYTO_LABEL_THEME = {
    dark: {
        node: {
            color: '#f8fafc',
            'text-outline-width': 2,
            'text-outline-color': '#0f172a',
            'text-background-color': '#0f172a'
        },
        edge: {
            color: '#e4e4e7',
            'text-outline-width': 2,
            'text-outline-color': '#09090b',
            'text-background-color': '#18181b',
            'text-background-opacity': 0.88,
            'text-background-padding': 3,
            'text-background-shape': 'roundrectangle'
        }
    },
    light: {
        node: {
            color: '#0f172a',
            'text-outline-width': 2,
            'text-outline-color': '#f8fafc',
            'text-background-color': '#f8fafc'
        },
        edge: {
            color: '#18181b',
            'text-outline-width': 2,
            'text-outline-color': '#f4f4f5',
            'text-background-color': '#ffffff',
            'text-background-opacity': 0.92,
            'text-background-padding': 3,
            'text-background-shape': 'roundrectangle'
        }
    }
};
const HELP_SEEN_KEY = 'multigraph-help-seen';
const SIDEBAR_PINNED_KEY = 'multigraph-sidebar-pinned';
const LINK_SUGGESTION_LIMIT = 8;
const TOAST_DURATION_MS = 2200;
const THEME_ORDER = ['auto', 'light', 'dark'];
const THEME_META = {
    auto: { icon: '◎' },
    light: { icon: '☀' },
    dark: { icon: '☾' }
};

function sortLocale(a, b) {
    return a.localeCompare(b, getCurrentLocale());
}

let currentTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'auto';
const MOBILE_BREAKPOINT = 1024;
const CUSTOM_TYPE_VALUE = '__custom__';

const ENTITY_TYPE_SELECTS = [
    { selectId: 'entity-type-select', customId: 'entity-type-custom' }
];

const REL_TYPE_SELECTS = [
    { selectId: 'rel-type-select', customId: 'rel-type-custom' }
];
const REL_TYPE_ADMIN = { selectId: 'rel-type-admin-select', customId: 'rel-type-admin-custom' };

function isMobileLayout() {
    return window.innerWidth < MOBILE_BREAKPOINT;
}

// ─── Thème ─────────────────────────────────────────────────────────────────

function applyTheme(theme) {
    currentTheme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    const dark = theme === 'dark'
        || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    const cytoscapeContainer = document.getElementById('cytoscape');
    if (cytoscapeContainer) {
        cytoscapeContainer.style.backgroundColor = dark ? '#09090b' : '#f4f4f5';
    }
    applyCytoscapeLabelTheme(dark);
    updateThemeButton();
}

function applyCytoscapeLabelTheme(dark) {
    if (!cy) return;
    const theme = dark ? CYTO_LABEL_THEME.dark : CYTO_LABEL_THEME.light;
    cy.style().selector('node').style(theme.node).update();
    cy.style().selector('edge').style(theme.edge).update();
}

function isDarkThemeActive() {
    return document.documentElement.classList.contains('dark');
}

function updateThemeButton() {
    const button = document.getElementById('btn-theme');
    if (!button) return;
    const meta = THEME_META[currentTheme];
    const label = t(`theme.${currentTheme}`);
    button.textContent = meta.icon;
    button.title = label;
    button.setAttribute('aria-label', label);
}

function cycleTheme() {
    applyTheme(THEME_ORDER[(THEME_ORDER.indexOf(currentTheme) + 1) % THEME_ORDER.length]);
}

function initTheme() {
    applyTheme(currentTheme);
    document.getElementById('btn-theme').addEventListener('click', cycleTheme);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (currentTheme === 'auto') applyTheme('auto');
    });
}

// ─── Sidebar & onglets ─────────────────────────────────────────────────────

function isSidebarPinned() {
    return localStorage.getItem(SIDEBAR_PINNED_KEY) === '1';
}

function updateSidebarPinButton(pinned, mobile) {
    const pinBtn = document.getElementById('sidebar-pin');
    if (!pinBtn) return;
    pinBtn.classList.toggle('hidden', !mobile);
    pinBtn.setAttribute('aria-pressed', pinned ? 'true' : 'false');
    pinBtn.classList.toggle('bg-emerald-100', pinned);
    pinBtn.classList.toggle('text-emerald-600', pinned);
    pinBtn.classList.toggle('dark:bg-emerald-950/40', pinned);
    pinBtn.classList.toggle('dark:text-emerald-400', pinned);
    pinBtn.classList.toggle('text-zinc-500', !pinned);
    pinBtn.title = t(pinned ? 'sidebar.unpin' : 'sidebar.pin');
    pinBtn.setAttribute('aria-label', pinBtn.title);
}

function applySidebarLayoutState() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    const mainPanel = document.getElementById('main-panel');
    const closeBtn = document.getElementById('sidebar-close');
    const openBtn = document.getElementById('sidebar-open');
    const mobile = isMobileLayout();
    const pinned = mobile && isSidebarPinned();

    if (!mobile) {
        sidebar?.classList.remove('-translate-x-full');
        backdrop?.classList.add('hidden');
        mainPanel?.classList.remove('sidebar-main-pinned');
        closeBtn?.classList.remove('hidden');
        openBtn?.classList.remove('hidden');
        sidebarOverlayOpen = false;
        updateSidebarPinButton(false, false);
        if (cy) cy.resize();
        return;
    }

    updateSidebarPinButton(pinned, true);

    if (pinned) {
        sidebar?.classList.remove('-translate-x-full');
        backdrop?.classList.add('hidden');
        mainPanel?.classList.add('sidebar-main-pinned');
        closeBtn?.classList.add('hidden');
        openBtn?.classList.add('hidden');
        document.getElementById('mobile-fab-create')?.classList.add('hidden');
        sidebarOverlayOpen = false;
    } else {
        mainPanel?.classList.remove('sidebar-main-pinned');
        closeBtn?.classList.remove('hidden');
        openBtn?.classList.remove('hidden');
        document.getElementById('mobile-fab-create')?.classList.remove('hidden');
        if (sidebarOverlayOpen) {
            sidebar?.classList.remove('-translate-x-full');
            backdrop?.classList.remove('hidden');
        } else {
            sidebar?.classList.add('-translate-x-full');
            backdrop?.classList.add('hidden');
        }
    }

    if (cy) cy.resize();
}

function toggleSidebarPin() {
    const pinned = !isSidebarPinned();
    localStorage.setItem(SIDEBAR_PINNED_KEY, pinned ? '1' : '0');
    if (!pinned) sidebarOverlayOpen = false;
    applySidebarLayoutState();
}

function openSidebar(tab) {
    if (tab) setSidebarTab(tab, { silent: true });
    if (isMobileLayout() && isSidebarPinned()) return;
    sidebarOverlayOpen = true;
    applySidebarLayoutState();
}

function closeSidebar() {
    if (isMobileLayout() && isSidebarPinned()) return;
    sidebarOverlayOpen = false;
    applySidebarLayoutState();
}

function mountSection(section, panelId) {
    const panel = document.getElementById(panelId);
    if (panel && section) panel.appendChild(section);
}

function focusEntityNameField() {
    requestAnimationFrame(() => document.getElementById('entity-name')?.focus());
}

function setSidebarTab(tab, options = {}) {
    sidebarTab = tab;
    document.querySelectorAll('.sidebar-tab').forEach(btn => {
        const active = btn.dataset.tab === tab;
        btn.classList.toggle('border-emerald-500', active);
        btn.classList.toggle('text-emerald-600', active);
        btn.classList.toggle('dark:text-emerald-400', active);
        btn.classList.toggle('font-semibold', active);
        btn.classList.toggle('border-transparent', !active);
        btn.classList.toggle('text-zinc-500', !active);
        btn.classList.toggle('font-medium', !active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('.sidebar-panel').forEach(panel => panel.classList.add('hidden'));
    document.getElementById(`panel-tab-${tab}`)?.classList.remove('hidden');
    updateSidebarContent();
    if (tab === 'create' && !options.silent && !options.skipFocus) {
        if (createSubTab === 'entity') focusEntityNameField();
        else if (createSubTab === 'link') document.getElementById('rel-source-name')?.focus();
    }
}

function setCreateSubTab(sub, options = {}) {
    createSubTab = sub;
    document.querySelectorAll('.create-sub-btn').forEach(btn => {
        const active = btn.dataset.createSub === sub;
        btn.classList.toggle('bg-white', active);
        btn.classList.toggle('shadow', active);
        btn.classList.toggle('dark:bg-zinc-700', active);
        btn.classList.toggle('text-zinc-900', active);
        btn.classList.toggle('dark:text-white', active);
        btn.classList.toggle('text-zinc-500', !active);
    });
    document.getElementById('create-mount-entity').classList.toggle('hidden', sub !== 'entity');
    document.getElementById('create-mount-link').classList.toggle('hidden', sub !== 'link');
    document.getElementById('create-mount-type').classList.toggle('hidden', sub !== 'type');
    if (sub === 'entity') resetEntityFormCreate();
    if (sub === 'link') resetLinkFormCreate();
    if (sub === 'type') syncRelTypeAdminForm();
    updateSidebarContent();
    if (sub === 'entity' && !options.skipFocus) focusEntityNameField();
    if (sub === 'link' && !options.skipFocus) document.getElementById('rel-source-name')?.focus();
}

function updateSidebarContent() {
    if (sidebarTab === 'create' && createSubTab === 'entity') {
        mountSection(entityFormSection, 'create-mount-entity');
        resetEntityFormCreate();
    } else if (sidebarTab === 'detail' && selectedElement?.isNode?.()) {
        mountSection(entityFormSection, 'detail-mount-entity');
        loadEntityFormFromNode(selectedElement);
        setEntityFormMode('edit');
    } else if (sidebarTab === 'create' && createSubTab === 'link') {
        document.getElementById('create-mount-link-form')?.classList.remove('hidden');
        mountSection(relFormSection, 'create-mount-link-form');
        setRelFormMode('create-link');
    } else if (sidebarTab === 'detail' && selectedElement?.isEdge?.()) {
        mountSection(relFormSection, 'detail-mount-relationship');
        loadRelFormFromEdge(selectedElement);
        setRelFormMode('edit');
    }
    updateDetailEmptyState();
}

function updateDetailEmptyState() {
    const empty = document.getElementById('detail-empty');
    const entityMount = document.getElementById('detail-mount-entity');
    const relMount = document.getElementById('detail-mount-relationship');
    const hasSelection = selectedElement && !selectedElement.empty();

    if (sidebarTab !== 'detail') {
        empty?.classList.add('hidden');
        entityMount?.classList.add('hidden');
        relMount?.classList.add('hidden');
        return;
    }

    if (!hasSelection) {
        empty?.classList.remove('hidden');
        entityMount?.classList.add('hidden');
        relMount?.classList.add('hidden');
        return;
    }

    empty?.classList.add('hidden');
    if (selectedElement.isNode()) {
        entityMount?.classList.remove('hidden');
        relMount?.classList.add('hidden');
    } else {
        entityMount?.classList.add('hidden');
        relMount?.classList.remove('hidden');
    }
}

function initSidebar() {
    document.getElementById('sidebar-open').addEventListener('click', () => openSidebar(sidebarTab));
    document.getElementById('sidebar-close').addEventListener('click', closeSidebar);
    document.getElementById('sidebar-backdrop').addEventListener('click', closeSidebar);
    document.getElementById('sidebar-pin')?.addEventListener('click', toggleSidebarPin);

    document.querySelectorAll('.sidebar-tab').forEach(btn => {
        btn.addEventListener('click', () => setSidebarTab(btn.dataset.tab));
    });

    document.querySelectorAll('.create-sub-btn').forEach(btn => {
        btn.addEventListener('click', () => setCreateSubTab(btn.dataset.createSub));
    });

    document.getElementById('mobile-fab-create').addEventListener('click', () => {
        setSidebarTab('create');
        setCreateSubTab('entity');
        openSidebar('create');
        focusEntityNameField();
    });

    applySidebarLayoutState();

    entityFormSection = document.getElementById('tpl-form-entity').content.firstElementChild.cloneNode(true);
    relFormSection = document.getElementById('tpl-form-relationship').content.firstElementChild.cloneNode(true);
    applyStaticTranslations(entityFormSection);
    applyStaticTranslations(relFormSection);
    mountSection(entityFormSection, 'create-mount-entity');
    mountSection(relFormSection, 'create-mount-link-form');
    setEntityFormMode('create');
}

// ─── Toast & modale ────────────────────────────────────────────────────────

function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = [
        'pointer-events-none fixed left-1/2 z-50 max-w-sm -translate-x-1/2 rounded-lg border px-4 py-2 text-sm shadow-lg bottom-6',
        isError
            ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200'
            : 'border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100'
    ].join(' ');
    toast.classList.remove('hidden');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => toast.classList.add('hidden'), TOAST_DURATION_MS);
}

function setButtonLoading(button, loading, loadingText = '…') {
    if (!button) return;
    if (loading) {
        button.disabled = true;
        button.dataset.originalText = button.textContent;
        button.textContent = loadingText;
        button.classList.add('opacity-70', 'cursor-wait');
    } else {
        button.disabled = false;
        if (button.dataset.originalText) {
            button.textContent = button.dataset.originalText;
            delete button.dataset.originalText;
        }
        button.classList.remove('opacity-70', 'cursor-wait');
    }
}

async function withSubmitLoading(form, loadingText, action) {
    const button = form.querySelector('button[type="submit"]');
    setButtonLoading(button, true, loadingText);
    try {
        await action();
    } finally {
        setButtonLoading(button, false);
    }
}

function showConfirm(title, message, onConfirm, options = {}) {
    const confirmKey = options.confirmKey || 'confirm.delete';
    const destructive = options.destructive ?? (confirmKey === 'confirm.delete');
    document.getElementById('modal-confirm-title').textContent = title;
    document.getElementById('modal-confirm-message').textContent = message;
    const okBtn = document.getElementById('modal-confirm-ok');
    okBtn.textContent = t(confirmKey);
    okBtn.className = destructive
        ? 'min-h-11 flex-1 rounded-lg bg-red-600 font-medium hover:bg-red-500'
        : 'min-h-11 flex-1 rounded-lg bg-indigo-600 font-medium hover:bg-indigo-500';
    document.getElementById('modal-confirm').classList.remove('hidden');
    document.getElementById('modal-confirm').classList.add('flex');
    confirmCallback = onConfirm;
}

function hideConfirm() {
    document.getElementById('modal-confirm').classList.add('hidden');
    document.getElementById('modal-confirm').classList.remove('flex');
    confirmCallback = null;
}

function initModal() {
    document.getElementById('modal-confirm-cancel').addEventListener('click', hideConfirm);
    document.getElementById('modal-confirm-ok').addEventListener('click', () => {
        const cb = confirmCallback;
        hideConfirm();
        if (cb) cb();
    });
}

const ENTITY_DESCRIPTION_EXPAND_THRESHOLD = 280;

function updateEntityDescriptionExpandButton() {
    const textarea = document.getElementById('entity-description');
    const button = document.getElementById('btn-entity-description-expand');
    if (!textarea || !button) return;
    button.classList.toggle('hidden', textarea.value.trim().length < ENTITY_DESCRIPTION_EXPAND_THRESHOLD);
}

function showEntityDescriptionModal() {
    const textarea = document.getElementById('entity-description');
    const modal = document.getElementById('modal-entity-description');
    const body = document.getElementById('modal-entity-description-body');
    const entityLabel = document.getElementById('modal-entity-description-entity');
    if (!textarea || !modal || !body || !entityLabel) return;
    entityLabel.textContent = document.getElementById('entity-name')?.value?.trim() || t('entity.defaultTitle');
    body.textContent = textarea.value;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.getElementById('modal-entity-description-close')?.focus();
}

function hideEntityDescriptionModal() {
    const modal = document.getElementById('modal-entity-description');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function initEntityDescriptionField() {
    const textarea = document.getElementById('entity-description');
    textarea?.addEventListener('input', updateEntityDescriptionExpandButton);
    document.getElementById('btn-entity-description-expand')?.addEventListener('click', showEntityDescriptionModal);
    document.getElementById('modal-entity-description-close')?.addEventListener('click', hideEntityDescriptionModal);
    document.getElementById('modal-entity-description')?.addEventListener('click', (e) => {
        if (e.target.id === 'modal-entity-description') hideEntityDescriptionModal();
    });
    updateEntityDescriptionExpandButton();
}

// ─── Formulaires unifiés ───────────────────────────────────────────────────

function setEntityFormMode(mode) {
    const isEdit = mode === 'edit';
    const idField = document.getElementById('entity-id');
    if (idField && !isEdit) idField.value = '';
    const submitBtn = document.getElementById('entity-form-submit');
    if (submitBtn) submitBtn.textContent = isEdit ? t('entity.save') : t('entity.create');
    document.getElementById('entity-detail-actions')?.classList.toggle('hidden', !isEdit);
}

function resetEntityFormCreate() {
    const form = document.getElementById('form-entity');
    form?.reset();
    const idField = document.getElementById('entity-id');
    if (idField) idField.value = '';
    const colorPicker = document.getElementById('entity-color');
    if (colorPicker) colorPicker.value = '#64748b';
    setTypeSelectValue('entity-type-select', 'entity-type-custom', 'Person');
    setEntityFormMode('create');
    updateEntityDescriptionExpandButton();
}

function loadEntityFormFromNode(node) {
    const d = node.data();
    document.getElementById('entity-id').value = d.id;
    document.getElementById('entity-name').value = d.label || '';
    setTypeSelectValue('entity-type-select', 'entity-type-custom', d.type || '');
    document.getElementById('entity-description').value = d.description || '';
    const color = d.color || '#64748b';
    document.getElementById('entity-color').value = color;
    setEntityFormMode('edit');

    selectionSnapshot = {
        kind: 'entity',
        id: d.id,
        payload: {
            name: d.label || '',
            type: d.type || '',
            color,
            description: d.description || null
        }
    };
    updateEntityDescriptionExpandButton();
}

function setRelFormMode(mode) {
    const isEdit = mode === 'edit';
    const isCreateLink = mode === 'create-link';
    document.getElementById('rel-form-submit').textContent = isEdit ? t('relationship.save') : t('relationship.createLink');
    document.getElementById('rel-form-title').classList.toggle('hidden', !isEdit);
    document.getElementById('rel-endpoints-create').classList.toggle('hidden', isEdit);
    document.getElementById('rel-endpoints-select').classList.toggle('hidden', !isEdit);
    document.getElementById('rel-detail-actions').classList.toggle('hidden', !isEdit);
    if (isCreateLink) document.getElementById('rel-id').value = '';
    refreshRelTypeSelectForForm(isEdit);
    updateRelCustomTypeStyleVisibility();
}

function refreshRelTypeSelectForForm(isEdit) {
    const types = [...knownRelTypes].sort(sortLocale);
    const current = getTypeSelectValue('rel-type-select', 'rel-type-custom');
    populateTypeSelect('rel-type-select', types, { allowCustom: !isEdit });
    setTypeSelectValue('rel-type-select', 'rel-type-custom', current);
}

function isRelCustomTypeSelected() {
    return document.getElementById('rel-type-select')?.value === CUSTOM_TYPE_VALUE;
}

function updateRelCustomTypeStyleVisibility() {
    const customStyle = document.getElementById('rel-custom-type-style');
    const isEdit = Boolean(document.getElementById('rel-id')?.value);
    if (!customStyle) return;
    customStyle.classList.toggle('hidden', isEdit || !isRelCustomTypeSelected());
}

function resetRelStyleDefaults() {
    const color = document.getElementById('rel-color');
    const lineStyle = document.getElementById('rel-line-style');
    const label = document.getElementById('rel-label');
    if (color) color.value = '#60a5fa';
    if (lineStyle) lineStyle.value = 'solid';
    if (label) label.value = '';
}

function resetLinkFormCreate() {
    const form = document.getElementById('form-relationship');
    if (!form) return;
    document.getElementById('rel-id').value = '';
    document.getElementById('rel-source-id').value = '';
    document.getElementById('rel-target-id').value = '';
    const sourceName = document.getElementById('rel-source-name');
    const targetName = document.getElementById('rel-target-name');
    if (sourceName) sourceName.value = '';
    if (targetName) targetName.value = '';
    hideEntitySuggestions(document.getElementById('rel-source-suggestions'));
    hideEntitySuggestions(document.getElementById('rel-target-suggestions'));
    const label = document.getElementById('rel-label');
    if (label) label.value = '';
    resetRelStyleDefaults();
    linkPickFocus = 'source';
    setRelFormMode('create-link');
}

function setLinkEndpoint(role, node) {
    const isSource = role === 'source';
    const idField = document.getElementById(isSource ? 'rel-source-id' : 'rel-target-id');
    const nameField = document.getElementById(isSource ? 'rel-source-name' : 'rel-target-name');
    if (idField) idField.value = node.data('id');
    if (nameField) nameField.value = node.data('label') || '';
    hideEntitySuggestions(document.getElementById(isSource ? 'rel-source-suggestions' : 'rel-target-suggestions'));
    linkPickFocus = 'target';
}

function focusLinkEndpointField(role) {
    const field = document.getElementById(role === 'source' ? 'rel-source-name' : 'rel-target-name');
    if (field && document.activeElement !== field) field.focus();
}

function handleCreateLinkGraphPick(node) {
    const sourceNameEl = document.getElementById('rel-source-name');
    const targetNameEl = document.getElementById('rel-target-name');
    const sourceIdEl = document.getElementById('rel-source-id');
    const targetIdEl = document.getElementById('rel-target-id');
    if (!sourceNameEl || !targetNameEl) return;

    let role = linkPickFocus;
    const active = document.activeElement;
    if (active === targetNameEl) role = 'target';
    else if (active === sourceNameEl) role = 'source';
    else if (!sourceIdEl.value && !sourceNameEl.value.trim()) role = 'source';
    else if (!targetIdEl.value && !targetNameEl.value.trim()) role = 'target';

    setLinkEndpoint(role, node);
    if (role === 'source') focusLinkEndpointField('target');
}

function isCreateLinkPanelActive() {
    return sidebarTab === 'create' && createSubTab === 'link';
}

function loadRelFormFromEdge(edge) {
    const d = edge.data();
    const relId = d.id.startsWith('e') ? d.id.slice(1) : d.id;
    document.getElementById('rel-id').value = relId;
    populateEntitySelects(d.source, d.target);
    setTypeSelectValue('rel-type-select', 'rel-type-custom', d.relationshipType || '');
    setRelFormMode('edit');

    selectionSnapshot = {
        kind: 'relationship',
        id: relId,
        payload: {
            sourceId: Number(d.source),
            targetId: Number(d.target),
            sourceName: cy.getElementById(d.source).data('label') || '',
            targetName: cy.getElementById(d.target).data('label') || '',
            typeName: d.relationshipType || ''
        }
    };
}

function populateEntitySelects(selectedSourceId, selectedTargetId) {
    const sourceSelect = document.getElementById('rel-source-select');
    const targetSelect = document.getElementById('rel-target-select');
    sourceSelect.innerHTML = '';
    targetSelect.innerHTML = '';

    cy.nodes()
        .sort((a, b) => (a.data('label') || '').localeCompare(b.data('label') || '', getCurrentLocale()))
        .forEach(node => {
            const id = node.data('id');
            const label = node.data('label');
            const sourceOpt = document.createElement('option');
            sourceOpt.value = id;
            sourceOpt.textContent = label;
            sourceSelect.appendChild(sourceOpt);
            const targetOpt = document.createElement('option');
            targetOpt.value = id;
            targetOpt.textContent = label;
            targetSelect.appendChild(targetOpt);
        });

    sourceSelect.value = String(selectedSourceId);
    targetSelect.value = String(selectedTargetId);
}

// ─── Sélection ─────────────────────────────────────────────────────────────

function clearSelection(options = {}) {
    if (selectedElement) {
        selectedElement.unselect();
        selectedElement = null;
    }
    if (!options.keepTab) {
        updateSelectionUI();
    } else {
        refreshEntityList();
        updateDetailEmptyState();
    }
}

function selectElement(ele, options = {}) {
    if (selectedElement) selectedElement.unselect();
    selectedElement = ele;
    ele.select();
    if (options.switchToDetail !== false) {
        setSidebarTab('detail');
    }
    updateSelectionUI();
    if (!options.skipFocus) {
        focusOnElement(ele);
    }
    refreshEntityList();
}

function isFocusOnSelectEnabled() {
    return localStorage.getItem(FOCUS_ON_SELECT_KEY) !== '0';
}

function focusOnElement(ele) {
    if (!isFocusOnSelectEnabled()) return;
    if (!cy || !ele || ele.empty()) return;
    const neighborNodes = ele.isNode() ? ele.neighborhood('node') : ele.connectedNodes();
    if (neighborNodes.length > 0) {
        cy.animate({
            fit: { eles: ele.union(neighborNodes), padding: 80 }
        }, { duration: 220 });
        return;
    }
    cy.animate({
        center: { eles: ele },
        zoom: Math.min(cy.zoom(), 1.0)
    }, { duration: 220 });
}

function updateSelectionUI() {
    if (!selectedElement || selectedElement.empty()) {
        refreshEntityList();
        updateDetailEmptyState();
        return;
    }

    if (selectedElement.isNode()) {
        mountSection(entityFormSection, 'detail-mount-entity');
        loadEntityFormFromNode(selectedElement);
    } else {
        mountSection(relFormSection, 'detail-mount-relationship');
        loadRelFormFromEdge(selectedElement);
    }

    updateDetailEmptyState();
}

function requestDeleteSelection() {
    if (!selectedElement || selectedElement.empty()) return;
    if (selectedElement.isNode()) {
        const label = selectedElement.data('label');
        showConfirm(t('confirm.deleteEntityTitle'), t('confirm.deleteEntityMessage', { name: label }),
            () => deleteEntity(selectedElement.data('id'), { fromSelection: true }));
    } else {
        showConfirm(t('confirm.deleteRelTitle'), t('confirm.deleteRelMessage'),
            () => deleteRelationship(selectedElement.data('id'), { fromSelection: true }));
    }
}

function startLinkFromSelection() {
    const node = selectedElement;
    if (!node || !node.isNode()) return;

    cancelLinkPending();
    setSidebarTab('create', { skipFocus: true });
    setCreateSubTab('link', { skipFocus: true });
    setLinkEndpoint('source', node);
    requestAnimationFrame(() => focusLinkEndpointField('target'));
    if (isMobileLayout()) openSidebar('create');
}

// ─── Mode lien ─────────────────────────────────────────────────────────────

function cancelLinkPending() {
    if (linkSourceNode) {
        linkSourceNode.unselect();
        linkSourceNode = null;
    }
    document.getElementById('rel-id').value = '';
}

// ─── Cytoscape ─────────────────────────────────────────────────────────────

function loadSavedPositions() {
    try {
        const raw = localStorage.getItem(POSITIONS_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function saveNodePositions() {
    if (!cy) return;
    const positions = loadSavedPositions();
    const currentIds = new Set();
    cy.nodes().forEach(node => {
        currentIds.add(node.id());
        positions[node.id()] = node.position();
    });
    Object.keys(positions).forEach(id => {
        if (!currentIds.has(id)) delete positions[id];
    });
    localStorage.setItem(POSITIONS_STORAGE_KEY, JSON.stringify(positions));
}

function applySavedPositions(saved) {
    if (!cy) return 0;
    let count = 0;
    cy.nodes().forEach(node => {
        const pos = saved[node.id()];
        if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
            node.position(pos);
            count++;
        }
    });
    return count;
}

function getViewportGraphCenter() {
    if (!cy) return { x: 0, y: 0 };
    const ext = cy.extent();
    return { x: ext.x1 + ext.w / 2, y: ext.y1 + ext.h / 2 };
}

function ensureNodeCenteredInViewport(node) {
    if (!cy || !node || node.empty()) return;
    node.position(getViewportGraphCenter());
    saveNodePositions();
    cy.resize();
    cy.animate({ fit: { eles: node, padding: 80 } }, { duration: 200 });
}

function placeNewNodesNearNeighbors(saved) {
    cy.nodes().forEach(node => {
        if (saved[node.id()]) return;
        const neighbors = node.neighborhood('node');
        if (neighbors.length > 0) {
            let x = 0, y = 0;
            neighbors.forEach(n => { x += n.position('x'); y += n.position('y'); });
            node.position({ x: x / neighbors.length, y: y / neighbors.length });
            return;
        }
        const positioned = cy.nodes().filter(n => saved[n.id()]);
        if (positioned.length === 0) {
            node.position(getViewportGraphCenter());
            return;
        }
        let x = 0, y = 0;
        positioned.forEach(n => { x += n.position('x'); y += n.position('y'); });
        node.position({
            x: x / positioned.length + (Math.random() - 0.5) * 120,
            y: y / positioned.length + (Math.random() - 0.5) * 120
        });
    });
}

function getCoseLayoutOptions({ animate, randomize }) {
    return {
        name: 'cose', animate, randomize, fit: true, padding: 40,
        idealEdgeLength: 140, nodeOverlap: 20, nodeRepulsion: 4500, gravity: 0.2,
        numIter: randomize ? 1000 : 400,
        stop: () => { saveNodePositions(); zoomFit(); }
    };
}

function captureGraphPositions() {
    const positions = loadSavedPositions();
    if (!cy) return positions;
    cy.nodes().forEach(node => {
        positions[node.id()] = { x: node.position('x'), y: node.position('y') };
    });
    return positions;
}

async function reloadGraphPreservingLayout(options = {}) {
    const positions = captureGraphPositions();
    await loadGraphFromBackend({ preserveLayout: true, positions, ...options });
}

function runGraphLayout(savedPositions, options = {}) {
    const nodeCount = cy.nodes().length;
    if (nodeCount === 0) return;
    const positionedCount = applySavedPositions(savedPositions);
    if (options.preserveLayout) {
        placeNewNodesNearNeighbors(savedPositions);
        saveNodePositions();
        return;
    }
    if (positionedCount === nodeCount) { zoomFit(); return; }
    if (positionedCount > 0) {
        placeNewNodesNearNeighbors(savedPositions);
        cy.layout(getCoseLayoutOptions({ animate: false, randomize: false })).run();
        return;
    }
    cy.layout(getCoseLayoutOptions({ animate: true, randomize: true })).run();
}

function reorganizeGraph() {
    if (!cy || cy.nodes().length === 0) {
        showToast(t('toast.emptyGraph'), true);
        return;
    }
    localStorage.removeItem(POSITIONS_STORAGE_KEY);
    cy.layout(getCoseLayoutOptions({ animate: true, randomize: true })).run();
    showToast(t('toast.layoutDone'));
}

function initCytoscape() {
    cy = cytoscape({
        container: document.getElementById('cytoscape'),
        minZoom: 0.3, maxZoom: 3,
        userPanningEnabled: true, userZoomingEnabled: true, boxSelectionEnabled: false,
        style: [
            {
                selector: 'node',
                style: {
                    'background-color': 'data(color)', 'label': 'data(label)',
                    'width': 48, 'height': 48, 'font-size': 13, 'min-zoomed-font-size': 11,
                    'text-wrap': 'wrap', 'text-max-width': 90,
                    'text-valign': 'bottom', 'text-halign': 'center', 'text-margin-y': 6,
                    'text-background-opacity': 0.85,
                    'text-background-padding': 4, 'text-background-shape': 'roundrectangle',
                    'font-weight': '600'
                }
            },
            {
                selector: 'node:selected',
                style: {
                    'width': 56, 'height': 56, 'border-width': 4, 'border-color': '#fbbf24',
                    'overlay-color': '#fbbf24', 'overlay-opacity': 0.18, 'overlay-padding': 10
                }
            },
            {
                selector: 'edge',
                style: {
                    'width': 'data(width)', 'line-color': 'data(color)',
                    'target-arrow-shape': 'triangle', 'target-arrow-color': 'data(color)', 'arrow-scale': 1.2,
                    'curve-style': 'bezier', 'label': 'data(label)', 'font-size': 11,
                    'text-rotation': 'autorotate', 'text-margin-y': -10, 'line-style': 'data(lineStyle)'
                }
            },
            {
                selector: 'edge:selected',
                style: {
                    'width': 6, 'line-color': '#fbbf24', 'target-arrow-color': '#fbbf24',
                    'overlay-color': '#fbbf24', 'overlay-opacity': 0.12, 'overlay-padding': 6
                }
            }
        ]
    });

    applyCytoscapeLabelTheme(isDarkThemeActive());

    cy.on('dragfree', 'node', saveNodePositions);
    cy.on('tap', 'node', (evt) => {
        if (isCreateLinkPanelActive()) {
            handleCreateLinkGraphPick(evt.target);
            return;
        }
        selectElement(evt.target);
    });
    cy.on('tap', 'edge', (evt) => {
        selectElement(evt.target);
    });
    cy.on('tap', (evt) => {
        if (evt.target === cy) clearSelection();
    });
}

function zoomIn() {
    if (!cy) return;
    cy.animate({ zoom: Math.min(cy.zoom() * 1.25, cy.maxZoom()), center: { eles: cy.elements() } }, { duration: 150 });
}

function zoomOut() {
    if (!cy) return;
    cy.animate({ zoom: Math.max(cy.zoom() / 1.25, cy.minZoom()), center: { eles: cy.elements() } }, { duration: 150 });
}

function zoomFit() {
    if (!cy) return;
    cy.animate({ fit: { eles: cy.elements(), padding: 40 } }, { duration: 200 });
}

function initZoomControls() {
    document.getElementById('zoom-in').addEventListener('click', zoomIn);
    document.getElementById('zoom-out').addEventListener('click', zoomOut);
    document.getElementById('zoom-fit').addEventListener('click', zoomFit);
}

// ─── Historique ────────────────────────────────────────────────────────────

function pushHistory(command) {
    if (historyState.applying) return;
    historyState.undoStack.push(command);
    if (historyState.undoStack.length > historyState.maxSize) historyState.undoStack.shift();
    historyState.redoStack = [];
    updateHistoryButtons();
}

function updateHistoryButtons() {
    document.getElementById('btn-undo').disabled = historyState.undoStack.length === 0;
    document.getElementById('btn-redo').disabled = historyState.redoStack.length === 0;
}

async function performUndo() {
    const command = historyState.undoStack.pop();
    if (!command) return;
    const positions = captureGraphPositions();
    historyState.applying = true;
    try {
        await command.undo();
        historyState.redoStack.push(command);
        clearSelection();
        showToast(t('toast.undoDone'));
        await loadGraphFromBackend({ preserveLayout: true, positions });
    } catch (err) {
        historyState.undoStack.push(command);
        showToast(t('toast.undoFailed'), true);
    } finally {
        historyState.applying = false;
        updateHistoryButtons();
    }
}

async function performRedo() {
    const command = historyState.redoStack.pop();
    if (!command) return;
    const positions = captureGraphPositions();
    historyState.applying = true;
    try {
        await command.redo();
        historyState.undoStack.push(command);
        clearSelection();
        showToast(t('toast.redoDone'));
        await loadGraphFromBackend({ preserveLayout: true, positions });
    } catch (err) {
        historyState.redoStack.push(command);
        showToast(t('toast.redoFailed'), true);
    } finally {
        historyState.applying = false;
        updateHistoryButtons();
    }
}

function initHistoryControls() {
    document.getElementById('btn-undo').addEventListener('click', performUndo);
    document.getElementById('btn-redo').addEventListener('click', performRedo);
    updateHistoryButtons();
}

function initKeyboardShortcuts() {
    document.addEventListener('keydown', handleGlobalKeydown);
}

function handleGlobalKeydown(e) {
    const helpOpen = !document.getElementById('modal-help').classList.contains('hidden');
    const confirmOpen = !document.getElementById('modal-confirm').classList.contains('hidden');
    const descriptionOpen = !document.getElementById('modal-entity-description').classList.contains('hidden');

    if (e.key === 'Escape') {
        if (descriptionOpen) { e.preventDefault(); hideEntityDescriptionModal(); return; }
        if (helpOpen) { e.preventDefault(); hideHelpModal(); return; }
        if (confirmOpen) { e.preventDefault(); hideConfirm(); return; }
        if (selectedElement) { e.preventDefault(); clearSelection(); }
        return;
    }

    if (e.target.matches('input, textarea, select')) return;

    if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        showHelpModal();
        return;
    }

    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); performUndo(); }
    else if (mod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); performRedo(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElement && !selectedElement.empty()) {
        e.preventDefault();
        requestDeleteSelection();
    }
}

// ─── API ───────────────────────────────────────────────────────────────────

async function apiRequest(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(await response.text() || `HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) return response.json();
    return response.text();
}

async function apiFetchRelationships() { return apiRequest('/relationships'); }
async function apiFetchEntities() { return apiRequest('/entities'); }
async function apiFetchRelationshipTypes() { return apiRequest('/relationship-types'); }

function mergeRelationshipTypeMeta(type) {
    if (!type?.name) return;
    knownRelTypes.add(type.name);
    const existing = knownRelTypeMeta.get(type.name) || {};
    knownRelTypeMeta.set(type.name, {
        id: type.id ?? existing.id ?? null,
        displayLabel: type.displayLabel ?? existing.displayLabel ?? null,
        color: type.color || existing.color || '#60a5fa',
        lineStyle: type.lineStyle || existing.lineStyle || 'solid'
    });
}

async function loadRelationshipTypesFromBackend() {
    try {
        const types = await apiFetchRelationshipTypes();
        (types || []).forEach(mergeRelationshipTypeMeta);
        refreshRelTypeSelects();
        refreshRelLegend();
    } catch (err) {
        console.error('Error loading relationship types:', err);
    }
}

function getRelationshipTypeDefaults(typeName) {
    const meta = knownRelTypeMeta.get(typeName);
    return {
        color: meta?.color || '#60a5fa',
        lineStyle: meta?.lineStyle || 'solid',
        displayLabel: meta?.displayLabel || typeName
    };
}

function resolveRelationshipPayloadStyle(typeName, isCustomType) {
    if (isCustomType) {
        return {
            color: document.getElementById('rel-color').value,
            lineStyle: document.getElementById('rel-line-style').value
        };
    }
    return getRelationshipTypeDefaults(typeName);
}

async function resolveEntityId(entityId, entityName) {
    const entities = await apiFetchEntities();
    const id = Number(entityId);
    if (entities.some(e => e.id === id)) return id;
    if (entityName) {
        const match = entities.find(e => e.name === entityName);
        if (match) return match.id;
    }
    throw new Error(t('errors.entityNotFound', { name: entityName || entityId }));
}

async function resolveRelationshipPayload(payload) {
    const sourceId = await resolveEntityId(payload.sourceId, payload.sourceName);
    const targetId = await resolveEntityId(payload.targetId, payload.targetName);
    return { ...payload, sourceId, targetId };
}

function toApiRelationshipBody(payload) {
    const { sourceName, targetName, ...body } = payload;
    return body;
}

async function apiCreateEntity(payload) {
    return apiRequest('/entities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}

async function apiUpdateEntity(id, payload) {
    return apiRequest(`/entities/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}

async function apiDeleteEntity(id) { return apiRequest(`/entities/${id}`, { method: 'DELETE' }); }

async function apiCreateRelationship(payload) {
    const resolved = await resolveRelationshipPayload(payload);
    return apiRequest('/relationships', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toApiRelationshipBody(resolved)) });
}

async function apiUpdateRelationship(id, payload) {
    const resolved = await resolveRelationshipPayload(payload);
    return apiRequest(`/relationships/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toApiRelationshipBody(resolved)) });
}

async function apiDeleteRelationship(id) { return apiRequest(`/relationships/${id}`, { method: 'DELETE' }); }

const AI_DEFAULT_ENTITY_COLOR = '#64748b';
const AI_DEFAULT_REL_COLOR = '#60a5fa';
const AI_PROMPT_OVERRIDE_KEY = 'multigraph-ai-prompt-overrides';

const AI_PROMPT_MODAL_TITLES = {
    document: 'ai.promptModalTitleDocument',
    export: 'ai.promptModalTitleExport',
    synthesis: 'ai.promptModalTitleSynthesis'
};

let aiPromptModalType = null;

function loadAiPromptOverrides() {
    try {
        return JSON.parse(localStorage.getItem(AI_PROMPT_OVERRIDE_KEY) || '{}');
    } catch {
        return {};
    }
}

function saveAiPromptOverrides(all) {
    localStorage.setItem(AI_PROMPT_OVERRIDE_KEY, JSON.stringify(all));
}

function getDefaultAiPromptText(type) {
    return tp(type, aiPromptParams());
}

function getAiPromptOverride(type) {
    const locale = getCurrentLocale();
    return loadAiPromptOverrides()[locale]?.[type] ?? null;
}

function setAiPromptOverride(type, text) {
    const all = loadAiPromptOverrides();
    const locale = getCurrentLocale();
    const defaults = getDefaultAiPromptText(type);
    if (!all[locale]) all[locale] = {};
    if (!text.trim() || text === defaults) {
        delete all[locale][type];
        if (Object.keys(all[locale]).length === 0) delete all[locale];
    } else {
        all[locale][type] = text;
    }
    saveAiPromptOverrides(all);
}

function getAiPromptText(type) {
    return getAiPromptOverride(type) ?? getDefaultAiPromptText(type);
}

async function buildAiGraphJson() {
    const [entities, relationships] = await Promise.all([apiFetchEntities(), apiFetchRelationships()]);
    return {
        entities: entities.map(entity => ({
            id: entity.id,
            name: entity.name,
            type: entity.type,
            color: entity.color || AI_DEFAULT_ENTITY_COLOR,
            description: entity.description?.trim() || null
        })),
        relationships: relationships.map(relationship => ({
            sourceId: relationship.source.id,
            targetId: relationship.target.id,
            typeName: relationship.type.name,
            color: relationship.type.color || AI_DEFAULT_REL_COLOR,
            label: relationship.label ?? relationship.type.displayLabel ?? relationship.type.name
        }))
    };
}

function aiPromptParams() {
    return { language: tp('languageName') };
}

function buildAiDocumentPrompt() {
    return getAiPromptText('document');
}

function buildAiExportPrompt() {
    return getAiPromptText('export');
}

async function generateTextualSynthesisPrompt() {
    const graph = await buildAiGraphJson();
    const graphJsonString = JSON.stringify(graph, null, 2);
    return `${getAiPromptText('synthesis')}\n\n${graphJsonString}`;
}

async function copyTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (!copied) throw new Error('clipboard unavailable');
}

async function copyAIPrompt() {
    const button = document.getElementById('btn-copy-ai-prompt');
    try {
        button?.setAttribute('disabled', 'disabled');
        await copyTextToClipboard(buildAiDocumentPrompt());
        showToast(t('ai.copyPromptDone'));
    } catch (err) {
        console.error('AI prompt copy failed:', err);
        showToast(t('ai.copyPromptFailed'), true);
    } finally {
        button?.removeAttribute('disabled');
    }
}

async function exportGraphForAI() {
    const button = document.getElementById('btn-export-ai');
    try {
        button?.setAttribute('disabled', 'disabled');
        const graph = await buildAiGraphJson();
        const graphJsonString = JSON.stringify(graph, null, 2);
        const exportText = `${buildAiExportPrompt()}\n\n${graphJsonString}`;
        await copyTextToClipboard(exportText);
        showToast(t('ai.exportDone'));
    } catch (err) {
        console.error('AI export failed:', err);
        showToast(t('ai.exportFailed'), true);
    } finally {
        button?.removeAttribute('disabled');
    }
}

async function copyTextualSynthesisPrompt() {
    const button = document.getElementById('btn-text-synthesis-ai');
    try {
        button?.setAttribute('disabled', 'disabled');
        await copyTextToClipboard(await generateTextualSynthesisPrompt());
        showToast(t('ai.synthesisDone'));
    } catch (err) {
        console.error('Textual synthesis prompt copy failed:', err);
        showToast(t('ai.synthesisFailed'), true);
    } finally {
        button?.removeAttribute('disabled');
    }
}

function parseAiGraphResponse(text) {
    let trimmed = String(text || '').trim();
    if (!trimmed) throw new Error('empty');

    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenced) trimmed = fenced[1].trim();

    if (!trimmed.startsWith('{')) {
        const objectMatch = trimmed.match(/\{[\s\S]*\}/);
        if (objectMatch) trimmed = objectMatch[0];
    }

    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object') throw new Error('invalid root');
    if (!Array.isArray(parsed.entities) || !Array.isArray(parsed.relationships)) {
        throw new Error('invalid shape');
    }
    return parsed;
}

function validateAiGraph(graph) {
    const entityIds = new Set();
    for (const entity of graph.entities) {
        if (entity == null || typeof entity !== 'object') throw new Error('invalid entity');
        const id = Number(entity.id);
        if (!Number.isInteger(id) || id <= 0) throw new Error('invalid entity id');
        if (entityIds.has(id)) throw new Error('duplicate entity id');
        entityIds.add(id);
        if (!String(entity.name || '').trim()) throw new Error('entity name required');
        if (!String(entity.type || '').trim()) throw new Error('entity type required');
    }
    for (const relationship of graph.relationships) {
        if (relationship == null || typeof relationship !== 'object') throw new Error('invalid relationship');
        const sourceId = Number(relationship.sourceId);
        const targetId = Number(relationship.targetId);
        if (!entityIds.has(sourceId) || !entityIds.has(targetId)) throw new Error('unknown relationship endpoint');
        if (!String(relationship.typeName || '').trim()) throw new Error('relationship type required');
    }
}

async function clearAllGraphData() {
    await apiRequest('/graph', { method: 'DELETE' });
}

async function resetGraph() {
    showConfirm(
        t('confirm.resetTitle'),
        t('confirm.resetMessage'),
        async () => {
            historyState.applying = true;
            try {
                await clearAllGraphData();
                historyState.undoStack = [];
                historyState.redoStack = [];
                knownRelTypes.clear();
                knownRelTypeMeta.clear();
                knownEntityTypes = new Set(['Person']);
                localStorage.removeItem(POSITIONS_STORAGE_KEY);
                clearSelection();
                setSidebarTab('create', { silent: true });
                setCreateSubTab('entity');
                await loadGraphFromBackend();
                refreshEntityList();
                showToast(t('toast.resetDone'));
            } catch (err) {
                console.error('Reset failed:', err);
                showToast(err.message || t('toast.error'), true);
            } finally {
                historyState.applying = false;
            }
        },
        { confirmKey: 'confirm.resetOk', destructive: true }
    );
}

async function applyAiGraph(graph) {
    historyState.applying = true;
    try {
        await clearAllGraphData();
        const idMap = new Map();
        for (const entity of graph.entities) {
            const created = await apiCreateEntity({
                name: String(entity.name).trim(),
                type: String(entity.type).trim(),
                color: entity.color || null,
                description: entity.description || null
            });
            idMap.set(Number(entity.id), created.id);
            knownEntityTypes.add(String(entity.type).trim());
        }
        for (const relationship of graph.relationships) {
            const sourceId = idMap.get(Number(relationship.sourceId));
            const targetId = idMap.get(Number(relationship.targetId));
            const typeName = String(relationship.typeName).trim();
            await apiCreateRelationship({
                sourceId,
                targetId,
                typeName,
                color: relationship.color || AI_DEFAULT_REL_COLOR,
                label: relationship.label || typeName,
                lineStyle: 'solid'
            });
            knownRelTypes.add(typeName);
        }
        historyState.undoStack = [];
        historyState.redoStack = [];
        await refreshRelTypeSelects();
        await refreshEntityTypeSelects();
        await loadGraphFromBackend();
        refreshEntityList();
    } finally {
        historyState.applying = false;
    }
}

async function importGraphFromAI() {
    const textarea = document.getElementById('ai-import-text');
    const raw = textarea?.value?.trim();
    if (!raw) {
        showToast(t('ai.importEmpty'), true);
        textarea?.focus();
        return;
    }

    let graph;
    try {
        graph = parseAiGraphResponse(raw);
        validateAiGraph(graph);
    } catch (err) {
        console.error('AI import parse failed:', err);
        showToast(t('ai.importFailed'), true);
        return;
    }

    showConfirm(
        t('ai.importConfirmTitle'),
        t('ai.importConfirmMessage'),
        async () => {
        const button = document.getElementById('btn-import-ai');
        try {
            button?.setAttribute('disabled', 'disabled');
            await applyAiGraph(graph);
            if (textarea) textarea.value = '';
            showToast(t('ai.importDone'));
        } catch (err) {
            console.error('AI import failed:', err);
            showToast(err.message || t('ai.importFailed'), true);
        } finally {
            button?.removeAttribute('disabled');
        }
    },
        { confirmKey: 'ai.importConfirmOk', destructive: false }
    );
}

function showAiPromptModal(type) {
    aiPromptModalType = type;
    const modal = document.getElementById('modal-ai-prompt');
    const title = document.getElementById('modal-ai-prompt-title');
    const hint = document.getElementById('modal-ai-prompt-hint');
    const textarea = document.getElementById('modal-ai-prompt-text');
    if (!modal || !title || !hint || !textarea) return;

    title.textContent = t(AI_PROMPT_MODAL_TITLES[type] || 'ai.viewPrompt');
    const showGraphHint = type === 'export' || type === 'synthesis';
    hint.textContent = showGraphHint ? t('ai.promptModalHintGraphJson') : '';
    hint.classList.toggle('hidden', !showGraphHint);
    textarea.value = getAiPromptText(type);
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    textarea.focus();
}

function hideAiPromptModal() {
    const modal = document.getElementById('modal-ai-prompt');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    aiPromptModalType = null;
}

function saveAiPromptModal() {
    if (!aiPromptModalType) return;
    const textarea = document.getElementById('modal-ai-prompt-text');
    if (!textarea) return;
    setAiPromptOverride(aiPromptModalType, textarea.value);
    hideAiPromptModal();
    showToast(t('ai.promptModalSaved'));
}

function resetAiPromptModal() {
    if (!aiPromptModalType) return;
    const textarea = document.getElementById('modal-ai-prompt-text');
    if (!textarea) return;
    setAiPromptOverride(aiPromptModalType, '');
    textarea.value = getDefaultAiPromptText(aiPromptModalType);
    showToast(t('ai.promptModalResetDone'));
}

function initAiPromptModal() {
    document.querySelectorAll('.ai-view-prompt-link').forEach(link => {
        link.addEventListener('click', () => {
            const type = link.dataset.aiPromptType;
            if (type) showAiPromptModal(type);
        });
    });
    document.getElementById('modal-ai-prompt-save')?.addEventListener('click', saveAiPromptModal);
    document.getElementById('modal-ai-prompt-reset')?.addEventListener('click', resetAiPromptModal);
    document.getElementById('modal-ai-prompt-cancel')?.addEventListener('click', hideAiPromptModal);
    document.getElementById('modal-ai-prompt')?.addEventListener('click', (e) => {
        if (e.target.id === 'modal-ai-prompt') hideAiPromptModal();
    });
}

function initAiExchange() {
    initAiPromptModal();
    document.getElementById('btn-copy-ai-prompt')?.addEventListener('click', copyAIPrompt);
    document.getElementById('btn-export-ai')?.addEventListener('click', exportGraphForAI);
    document.getElementById('btn-text-synthesis-ai')?.addEventListener('click', copyTextualSynthesisPrompt);
    document.getElementById('btn-import-ai')?.addEventListener('click', importGraphFromAI);
}

function relationshipPayloadFromApi(rel) {
    return {
        sourceId: rel.source.id, targetId: rel.target.id,
        sourceName: rel.source.name, targetName: rel.target.name,
        typeName: rel.type.name
    };
}

async function snapshotEntityDeletion(entityId) {
    const id = Number(entityId);
    const node = cy.getElementById(String(entityId));
    const entity = {
        id, name: node.data('label'), type: node.data('type'),
        color: node.data('color'), description: node.data('description') || null
    };
    const relationships = (await apiFetchRelationships())
        .filter(rel => rel.source.id === id || rel.target.id === id)
        .map(relationshipPayloadFromApi);
    return { entity, relationships };
}

async function restoreDeletedEntity(snapshot) {
    const created = await apiCreateEntity({
        name: snapshot.entity.name, type: snapshot.entity.type,
        color: snapshot.entity.color, description: snapshot.entity.description
    });
    const oldId = snapshot.entity.id;
    for (const rel of snapshot.relationships) {
        await apiCreateRelationship({
            ...rel,
            sourceId: rel.sourceId === oldId ? created.id : rel.sourceId,
            targetId: rel.targetId === oldId ? created.id : rel.targetId
        });
    }
    return created;
}

async function deleteEntity(entityId, options = {}) {
    try {
        let deletionSnapshot = null;
        if (!historyState.applying) deletionSnapshot = await snapshotEntityDeletion(entityId);
        await apiDeleteEntity(entityId);
        if (deletionSnapshot && !historyState.applying) {
            const state = { entityId: Number(entityId) };
            pushHistory({
                label: `suppression de « ${deletionSnapshot.entity.name} »`,
                undo: async () => { const c = await restoreDeletedEntity(deletionSnapshot); state.entityId = c.id; },
                redo: async () => { await apiDeleteEntity(state.entityId); }
            });
        }
        if (options.fromSelection) clearSelection();
        showToast(t('toast.deleted'));
        await reloadGraphPreservingLayout();
    } catch (err) {
        showToast(err.message || t('toast.error'), true);
    }
}

async function deleteRelationship(edgeId, options = {}) {
    const realId = edgeId.startsWith('e') ? edgeId.slice(1) : edgeId;
    try {
        let payload = null;
        if (!historyState.applying) {
            const rel = (await apiFetchRelationships()).find(r => String(r.id) === String(realId));
            if (rel) payload = relationshipPayloadFromApi(rel);
        }
        await apiDeleteRelationship(realId);
        if (payload && !historyState.applying) {
            const state = { relationshipId: Number(realId) };
            pushHistory({
                label: `suppression de la relation « ${payload.label} »`,
                undo: async () => { const c = await apiCreateRelationship(payload); state.relationshipId = c.id; },
                redo: async () => { await apiDeleteRelationship(state.relationshipId); }
            });
        }
        if (options.fromSelection) clearSelection();
        showToast(t('toast.deleted'));
        await reloadGraphPreservingLayout();
    } catch (err) {
        showToast(err.message || t('toast.error'), true);
    }
}

async function loadGraphFromBackend(options = {}) {
    try {
        await loadRelationshipTypesFromBackend();
        const response = await fetch('/graph');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const graphData = await response.json();
        cy.elements().remove();
        cy.add(graphData.elements);
        if (options.firstNodeInGraph) {
            localStorage.removeItem(POSITIONS_STORAGE_KEY);
        }
        const savedPositions = options.firstNodeInGraph
            ? {}
            : options.preserveLayout
                ? { ...loadSavedPositions(), ...options.positions }
                : loadSavedPositions();
        runGraphLayout(savedPositions, {
            preserveLayout: options.preserveLayout,
            firstNodeInGraph: options.firstNodeInGraph
        });
        updateGraphTypeSuggestions(graphData.elements);
        updateGraphStats(graphData.elements);
        refreshEntityList();
        refreshRelLegend();
        if (selectedElement && !selectedElement.empty()) {
            const restored = cy.getElementById(selectedElement.id());
            if (restored.nonempty()) {
                selectedElement = restored;
                selectedElement.select();
                updateSelectionUI();
            } else {
                clearSelection();
            }
        }
    } catch (err) {
        console.error('Error loading graph:', err);
        showToast(t('toast.loadError'), true);
    }
}

function updateGraphStats(elements) {
    const nodeCount = elements?.nodes?.length ?? cy?.nodes()?.length ?? 0;
    const edgeCount = elements?.edges?.length ?? cy?.edges()?.length ?? 0;
    const text = t('stats.summary', { entities: nodeCount, links: edgeCount });
    document.getElementById('graph-stats').textContent = text;
    document.getElementById('footer-stats').textContent = text;
}

function updateGraphTypeSuggestions(elements) {
    (elements?.nodes || []).forEach(node => {
        if (node.data?.type) knownEntityTypes.add(node.data.type);
    });
    (elements?.edges || []).forEach(edge => {
        const type = edge.data?.relationshipType;
        if (type) {
            const existing = knownRelTypeMeta.get(type) || {};
            knownRelTypes.add(type);
            knownRelTypeMeta.set(type, {
                id: existing.id ?? null,
                displayLabel: existing.displayLabel ?? edge.data?.label ?? null,
                color: edge.data?.color || existing.color || '#60a5fa',
                lineStyle: edge.data?.lineStyle || existing.lineStyle || 'solid'
            });
        }
    });
    refreshEntityTypeSelects();
    refreshRelTypeSelects();
    refreshEntityTypeFilter();
    refreshEntityRelTypeFilter();
}

function refreshEntityTypeFilter() {
    const filterEl = document.getElementById('entity-filter-type');
    if (!filterEl) return;
    const current = filterEl.value;
    filterEl.innerHTML = `<option value="">${t('browse.allTypes')}</option>`;
    [...knownEntityTypes].sort(sortLocale).forEach(type => {
        const opt = document.createElement('option');
        opt.value = type;
        opt.textContent = type;
        filterEl.appendChild(opt);
    });
    filterEl.value = [...filterEl.options].some(o => o.value === current) ? current : '';
}

function refreshEntityRelTypeFilter() {
    const filterEl = document.getElementById('entity-filter-rel-type');
    if (!filterEl) return;
    const current = filterEl.value;
    filterEl.innerHTML = `<option value="">${t('browse.allRelTypes')}</option>`;
    [...knownRelTypes].sort(sortLocale).forEach(type => {
        const opt = document.createElement('option');
        opt.value = type;
        opt.textContent = type;
        filterEl.appendChild(opt);
    });
    filterEl.value = [...filterEl.options].some(o => o.value === current) ? current : '';
}

function nodeMatchesSearchQuery(node, query) {
    if (!query) return true;
    const label = (node.data('label') || '').toLowerCase();
    const type = (node.data('type') || '').toLowerCase();
    if (label.includes(query) || type.includes(query)) return true;
    return node.connectedEdges().some(edge =>
        (edge.data('relationshipType') || '').toLowerCase().includes(query)
    );
}

function nodeHasRelType(node, relType) {
    if (!relType) return true;
    return node.connectedEdges().some(edge => edge.data('relationshipType') === relType);
}

function refreshEntityList() {
    const listEl = document.getElementById('entity-list');
    if (!listEl || !cy) return;
    const query = (document.getElementById('entity-search')?.value || '').trim().toLowerCase();
    const typeFilter = document.getElementById('entity-filter-type')?.value || '';
    const relTypeFilter = document.getElementById('entity-filter-rel-type')?.value || '';
    const selectedId = selectedElement?.isNode?.() ? selectedElement.id() : null;
    listEl.innerHTML = '';
    let count = 0;

    cy.nodes().sort((a, b) => (a.data('label') || '').localeCompare(b.data('label') || '', getCurrentLocale())).forEach(node => {
        const type = node.data('type') || '';
        if (!nodeMatchesSearchQuery(node, query)) return;
        if (typeFilter && type !== typeFilter) return;
        if (!nodeHasRelType(node, relTypeFilter)) return;
        count++;
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = [
            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700',
            node.id() === selectedId ? 'bg-amber-50 ring-2 ring-amber-400 dark:bg-amber-950/30' : ''
        ].join(' ');
        const dot = document.createElement('span');
        dot.className = 'h-3 w-3 shrink-0 rounded-full';
        dot.style.backgroundColor = node.data('color') || '#64748b';
        const name = document.createElement('span');
        name.className = 'min-w-0 flex-1 truncate';
        name.textContent = node.data('label') || '?';
        const badge = document.createElement('span');
        badge.className = 'shrink-0 text-[10px] uppercase text-zinc-500';
        badge.textContent = type;
        btn.appendChild(dot);
        btn.appendChild(name);
        btn.appendChild(badge);
        btn.addEventListener('click', () => {
            selectElement(node, { switchToDetail: false });
            if (isMobileLayout() && !isSidebarPinned()) closeSidebar();
        });
        li.appendChild(btn);
        listEl.appendChild(li);
    });

    if (count === 0) listEl.innerHTML = `<li class="px-2 py-2 text-center text-xs text-zinc-500">${t('browse.empty')}</li>`;
}

function refreshRelLegend() {}

function initRelLegend() {}

function initEntityList() {
    document.getElementById('entity-search')?.addEventListener('input', refreshEntityList);
    document.getElementById('entity-filter-type')?.addEventListener('change', refreshEntityList);
    document.getElementById('entity-filter-rel-type')?.addEventListener('change', refreshEntityList);
    const focusCheckbox = document.getElementById('browse-focus-on-select');
    if (focusCheckbox) {
        focusCheckbox.checked = isFocusOnSelectEnabled();
        focusCheckbox.addEventListener('change', () => {
            localStorage.setItem(FOCUS_ON_SELECT_KEY, focusCheckbox.checked ? '1' : '0');
        });
    }
}

function populateTypeSelect(selectId, types, options = {}) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = t('form.chooseType');
    placeholder.disabled = true;
    select.appendChild(placeholder);
    types.forEach(typeName => {
        const option = document.createElement('option');
        option.value = typeName;
        option.textContent = typeName;
        select.appendChild(option);
    });
    if (options.allowCustom !== false) {
        const customOption = document.createElement('option');
        customOption.value = CUSTOM_TYPE_VALUE;
        customOption.textContent = t('form.otherType');
        select.appendChild(customOption);
    }
}

function resetRelTypeAdminDefaults() {
    const color = document.getElementById('rel-type-color');
    const lineStyle = document.getElementById('rel-type-style');
    const displayLabel = document.getElementById('rel-type-display-label');
    if (color) color.value = '#60a5fa';
    if (lineStyle) lineStyle.value = 'solid';
    if (displayLabel) displayLabel.value = '';
}

function loadRelTypeAdminFields(typeName) {
    const meta = knownRelTypeMeta.get(typeName);
    const displayLabel = document.getElementById('rel-type-display-label');
    const color = document.getElementById('rel-type-color');
    const lineStyle = document.getElementById('rel-type-style');
    if (displayLabel) displayLabel.value = meta?.displayLabel || typeName;
    if (color) color.value = meta?.color || '#60a5fa';
    if (lineStyle) lineStyle.value = meta?.lineStyle || 'solid';
}

function updateRelTypeAdminSubmitMode() {
    const select = document.getElementById('rel-type-admin-select');
    const submit = document.getElementById('rel-type-submit');
    if (!select || !submit) return;
    submit.textContent = select.value === CUSTOM_TYPE_VALUE
        ? t('create.createRelType')
        : t('create.updateRelType');
}

function syncRelTypeAdminForm() {
    const current = getTypeSelectValue(REL_TYPE_ADMIN.selectId, REL_TYPE_ADMIN.customId);
    populateTypeSelect(REL_TYPE_ADMIN.selectId, [...knownRelTypes].sort(sortLocale));
    setTypeSelectValue(REL_TYPE_ADMIN.selectId, REL_TYPE_ADMIN.customId, current);
    const select = document.getElementById('rel-type-admin-select');
    if (select?.value && select.value !== CUSTOM_TYPE_VALUE) {
        loadRelTypeAdminFields(select.value);
    } else {
        resetRelTypeAdminDefaults();
    }
    updateRelTypeAdminSubmitMode();
}

function toggleCustomTypeField(customInput, visible) {
    if (!customInput) return;
    const wrap = customInput.closest('[data-custom-type-wrap]');
    if (wrap) wrap.classList.toggle('hidden', !visible);
    customInput.classList.toggle('hidden', !visible);
}

function setTypeSelectValue(selectId, customInputId, value) {
    const select = document.getElementById(selectId);
    const customInput = document.getElementById(customInputId);
    if (!select || !customInput) return;
    const normalized = String(value || '').trim();
    const options = [...select.options].map(o => o.value);
    if (normalized && options.includes(normalized)) {
        select.value = normalized;
        customInput.value = '';
        toggleCustomTypeField(customInput, false);
    } else if (normalized) {
        select.value = CUSTOM_TYPE_VALUE;
        customInput.value = normalized;
        toggleCustomTypeField(customInput, true);
    } else {
        select.value = '';
        customInput.value = '';
        toggleCustomTypeField(customInput, false);
    }
    if (selectId === 'rel-type-select') updateRelCustomTypeStyleVisibility();
}

function getTypeSelectValue(selectId, customInputId) {
    const select = document.getElementById(selectId);
    const customInput = document.getElementById(customInputId);
    if (!select) return '';
    if (select.value === CUSTOM_TYPE_VALUE) return customInput.value.trim();
    return select.value.trim();
}

function bindTypeSelectCustom(selectId, customInputId) {
    const select = document.getElementById(selectId);
    const customInput = document.getElementById(customInputId);
    if (!select || !customInput) return;
    select.addEventListener('change', () => {
        const isCustom = select.value === CUSTOM_TYPE_VALUE;
        toggleCustomTypeField(customInput, isCustom);
        if (isCustom) {
            if (selectId === 'rel-type-select') resetRelStyleDefaults();
            customInput.focus();
        }
        if (selectId === REL_TYPE_ADMIN.selectId) {
            if (isCustom) resetRelTypeAdminDefaults();
            else if (select.value) loadRelTypeAdminFields(select.value);
        }
        if (selectId === 'rel-type-select') updateRelCustomTypeStyleVisibility();
        if (selectId === REL_TYPE_ADMIN.selectId) updateRelTypeAdminSubmitMode();
    });
}

function refreshEntityTypeSelects() {
    const types = [...knownEntityTypes].sort();
    ENTITY_TYPE_SELECTS.forEach(({ selectId, customId }) => {
        const current = getTypeSelectValue(selectId, customId);
        populateTypeSelect(selectId, types);
        setTypeSelectValue(selectId, customId, current);
    });
}

function refreshRelTypeSelects() {
    const types = [...knownRelTypes].sort();
    REL_TYPE_SELECTS.forEach(({ selectId, customId }) => {
        const current = getTypeSelectValue(selectId, customId);
        populateTypeSelect(selectId, types);
        setTypeSelectValue(selectId, customId, current);
    });
    populateTypeSelect(REL_TYPE_ADMIN.selectId, types);
    const adminCurrent = getTypeSelectValue(REL_TYPE_ADMIN.selectId, REL_TYPE_ADMIN.customId);
    setTypeSelectValue(REL_TYPE_ADMIN.selectId, REL_TYPE_ADMIN.customId, adminCurrent);
    updateRelTypeAdminSubmitMode();
    refreshEntityRelTypeFilter();
}

function disableBrowserAutocomplete(input) {
    if (!input || input.dataset.noBrowserAutocomplete === '1') return;
    input.dataset.noBrowserAutocomplete = '1';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('name', `mg-${input.id}`);
    input.readOnly = true;
    input.addEventListener('focus', () => {
        input.readOnly = false;
    });
}

function hideEntitySuggestions(listEl) {
    if (!listEl) return;
    listEl.innerHTML = '';
    listEl.classList.add('hidden');
}

function getEntityNameSuggestions(prefix) {
    if (!cy) return [];
    const q = prefix.trim().toLowerCase();
    if (!q) return [];
    return cy.nodes()
        .filter(node => (node.data('label') || '').toLowerCase().startsWith(q))
        .sort((a, b) => sortLocale(a.data('label') || '', b.data('label') || ''))
        .slice(0, LINK_SUGGESTION_LIMIT)
        .map(node => ({ id: node.data('id'), name: node.data('label') || '' }));
}

function renderEntitySuggestions(input, listEl, idField, items) {
    listEl.innerHTML = '';
    if (!items.length) {
        listEl.classList.add('hidden');
        return;
    }
    items.forEach(item => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'block w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700';
        btn.textContent = item.name;
        btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            input.value = item.name;
            idField.value = item.id;
            hideEntitySuggestions(listEl);
        });
        li.appendChild(btn);
        listEl.appendChild(li);
    });
    listEl.classList.remove('hidden');
}

function initLinkEndpointFields() {
    [
        { nameId: 'rel-source-name', idField: 'rel-source-id', listId: 'rel-source-suggestions', role: 'source' },
        { nameId: 'rel-target-name', idField: 'rel-target-id', listId: 'rel-target-suggestions', role: 'target' }
    ].forEach(({ nameId, idField, listId, role }) => {
        const input = document.getElementById(nameId);
        const hidden = document.getElementById(idField);
        const list = document.getElementById(listId);
        if (!input || !hidden || !list) return;

        input.addEventListener('focus', () => {
            linkPickFocus = role;
            const query = input.value.trim();
            if (query) renderEntitySuggestions(input, list, hidden, getEntityNameSuggestions(query));
        });
        input.addEventListener('input', () => {
            hidden.value = '';
            renderEntitySuggestions(input, list, hidden, getEntityNameSuggestions(input.value));
        });
        input.addEventListener('blur', () => {
            setTimeout(() => hideEntitySuggestions(list), 150);
        });
    });
}

function initForms() {
    if (formsInitialized) return;

    const entityForm = document.getElementById('form-entity');
    const relForm = document.getElementById('form-relationship');
    const relTypeForm = document.getElementById('form-rel-type');
    if (!entityForm || !relForm || !relTypeForm) {
        console.error('Formulaires introuvables — le graphe ne peut pas initialiser les actions.');
        return;
    }

    formsInitialized = true;

    ENTITY_TYPE_SELECTS.forEach(({ selectId, customId }) => bindTypeSelectCustom(selectId, customId));
    REL_TYPE_SELECTS.forEach(({ selectId, customId }) => bindTypeSelectCustom(selectId, customId));
    bindTypeSelectCustom(REL_TYPE_ADMIN.selectId, REL_TYPE_ADMIN.customId);
    ['entity-name', 'rel-source-name', 'rel-target-name'].forEach(id => {
        disableBrowserAutocomplete(document.getElementById(id));
    });
    initLinkEndpointFields();
    initEntityDescriptionField();

    document.getElementById('form-entity').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const id = document.getElementById('entity-id').value;
        const payload = {
            name: document.getElementById('entity-name').value.trim(),
            type: getTypeSelectValue('entity-type-select', 'entity-type-custom'),
            color: document.getElementById('entity-color').value,
            description: document.getElementById('entity-description').value.trim() || null
        };
        if (!payload.type) { showToast(t('toast.typeRequired'), true); return; }

        const isEdit = Boolean(id);
        let selectCreatedNodeId = null;
        let wasEmptyGraph = false;
        await withSubmitLoading(form, isEdit ? t('toast.saving') : t('toast.creating'), async () => {
            try {
                if (isEdit) {
                    const before = selectionSnapshot?.kind === 'entity' && String(selectionSnapshot.id) === String(id)
                        ? selectionSnapshot.payload : null;
                    await apiUpdateEntity(id, payload);
                    if (before && !historyState.applying) {
                        knownEntityTypes.add(payload.type);
                        refreshEntityTypeSelects();
                        pushHistory({
                            label: `modification de « ${payload.name} »`,
                            undo: () => apiUpdateEntity(id, before),
                            redo: () => apiUpdateEntity(id, payload)
                        });
                    }
                    showToast(t('toast.saved'));
                } else {
                    wasEmptyGraph = cy.nodes().length === 0;
                    const created = await apiCreateEntity(payload);
                    selectCreatedNodeId = created.id;
                    if (!historyState.applying) {
                        const state = { entityId: created.id };
                        pushHistory({
                            label: `création de « ${created.name} »`,
                            undo: async () => { await apiDeleteEntity(state.entityId); },
                            redo: async () => {
                                const recreated = await apiCreateEntity(payload);
                                state.entityId = recreated.id;
                            }
                        });
                    }
                    resetEntityFormCreate();
                    showToast(t('toast.created'));
                }
                knownEntityTypes.add(payload.type);
                refreshEntityTypeSelects();
                await reloadGraphPreservingLayout({ firstNodeInGraph: wasEmptyGraph });
            } catch (err) {
                showToast(err.message || t('toast.error'), true);
            }
        });
        if (selectCreatedNodeId != null) {
            const newNode = cy.getElementById(String(selectCreatedNodeId));
            if (newNode.nonempty()) {
                if (wasEmptyGraph) {
                    ensureNodeCenteredInViewport(newNode);
                    selectElement(newNode, { skipFocus: true });
                } else {
                    selectElement(newNode);
                }
            }
        }
    });

    document.getElementById('form-relationship').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const id = document.getElementById('rel-id').value;
        const isEdit = Boolean(id);
        const sourceName = (isEdit
            ? document.getElementById('rel-source-select').selectedOptions[0]?.textContent
            : document.getElementById('rel-source-name').value) || '';
        const targetName = (isEdit
            ? document.getElementById('rel-target-select').selectedOptions[0]?.textContent
            : document.getElementById('rel-target-name').value) || '';
        if (!isEdit && (!sourceName.trim() || !targetName.trim())) {
            showToast(t('toast.endpointsRequired'), true);
            return;
        }
        const typeName = getTypeSelectValue('rel-type-select', 'rel-type-custom');
        const isCustomType = document.getElementById('rel-type-select').value === CUSTOM_TYPE_VALUE;
        const typeDefaults = getRelationshipTypeDefaults(typeName);
        const payload = {
            sourceId: isEdit
                ? Number(document.getElementById('rel-source-select').value)
                : Number(document.getElementById('rel-source-id').value),
            targetId: isEdit
                ? Number(document.getElementById('rel-target-select').value)
                : Number(document.getElementById('rel-target-id').value),
            sourceName: sourceName.trim(),
            targetName: targetName.trim(),
            typeName
        };
        if (!isEdit) {
            const style = resolveRelationshipPayloadStyle(typeName, isCustomType);
            if (isCustomType) {
                payload.label = document.getElementById('rel-label').value.trim() || typeName;
                payload.color = style.color;
                payload.lineStyle = style.lineStyle;
            } else {
                payload.label = typeDefaults.displayLabel;
                payload.color = typeDefaults.color;
                payload.lineStyle = typeDefaults.lineStyle;
            }
        }

        await withSubmitLoading(form, isEdit ? t('toast.saving') : t('toast.creating'), async () => {
            try {
                if (isEdit) {
                    const before = selectionSnapshot?.kind === 'relationship' && String(selectionSnapshot.id) === String(id)
                        ? selectionSnapshot.payload : null;
                    await apiUpdateRelationship(id, payload);
                    if (before && !historyState.applying) {
                        knownRelTypes.add(payload.typeName);
                        refreshRelTypeSelects();
                        pushHistory({
                            label: `modification de la relation « ${typeDefaults.displayLabel} »`,
                            undo: () => apiUpdateRelationship(id, before),
                            redo: () => apiUpdateRelationship(id, payload)
                        });
                    }
                    showToast(t('toast.saved'));
                } else {
                    const created = await apiCreateRelationship(payload);
                    if (!historyState.applying) {
                        knownRelTypes.add(payload.typeName);
                        refreshRelTypeSelects();
                        const state = { relationshipId: created.id };
                        pushHistory({
                            label: `création du lien « ${payload.label || typeName} »`,
                            undo: async () => { await apiDeleteRelationship(state.relationshipId); },
                            redo: async () => {
                                const recreated = await apiCreateRelationship(payload);
                                state.relationshipId = recreated.id;
                            }
                        });
                    }
                    resetLinkFormCreate();
                    cancelLinkPending();
                    showToast(t('toast.linkCreated'));
                }
                await reloadGraphPreservingLayout();
            } catch (err) {
                showToast(err.message || t('toast.error'), true);
            }
        });
    });

    document.getElementById('form-rel-type').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const select = document.getElementById('rel-type-admin-select');
        const isCreate = select.value === CUSTOM_TYPE_VALUE;
        const name = (isCreate
            ? document.getElementById('rel-type-admin-custom').value
            : select.value).trim();
        if (!name) { showToast(t('toast.typeRequired'), true); return; }
        const meta = knownRelTypeMeta.get(name);
        if (!isCreate && !meta?.id) { showToast(t('toast.typeNotFound'), true); return; }
        const displayLabel = document.getElementById('rel-type-display-label').value.trim() || name;
        const color = document.getElementById('rel-type-color').value;
        const lineStyle = document.getElementById('rel-type-style').value;
        await withSubmitLoading(form, isCreate ? t('toast.creating') : t('toast.saving'), async () => {
            try {
                const response = await fetch('/relationship-types', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(isCreate
                        ? { name, displayLabel, color, lineStyle }
                        : { id: meta.id, name, displayLabel, color, lineStyle })
                });
                if (!response.ok) { showToast(await response.text() || t('toast.error'), true); return; }
                const saved = await response.json();
                mergeRelationshipTypeMeta(saved);
                refreshRelTypeSelects();
                syncRelTypeAdminForm();
                refreshRelLegend();
                await reloadGraphPreservingLayout();
                showToast(isCreate ? t('toast.typeAdded') : t('toast.typeUpdated'));
            } catch {
                showToast(t('toast.networkError'), true);
            }
        });
    });

    document.getElementById('btn-delete-selection').addEventListener('click', requestDeleteSelection);
    document.getElementById('btn-delete-rel-selection').addEventListener('click', requestDeleteSelection);
    document.getElementById('btn-link-from-selection').addEventListener('click', startLinkFromSelection);
}

function initActionButtons() {
    document.getElementById('btn-reorganize').addEventListener('click', reorganizeGraph);
    document.getElementById('btn-reset').addEventListener('click', resetGraph);
    window.addEventListener('resize', applySidebarLayoutState);
}

function showHelpModal() {
    localStorage.setItem(HELP_SEEN_KEY, '1');
    document.getElementById('modal-help').classList.remove('hidden');
    document.getElementById('modal-help').classList.add('flex');
}

function hideHelpModal() {
    document.getElementById('modal-help').classList.add('hidden');
    document.getElementById('modal-help').classList.remove('flex');
}

function initHelpModal() {
    document.getElementById('sidebar-help-link')?.addEventListener('click', showHelpModal);
    document.getElementById('modal-help-close')?.addEventListener('click', hideHelpModal);
    document.getElementById('modal-help')?.addEventListener('click', (e) => {
        if (e.target.id === 'modal-help') hideHelpModal();
    });
    if (!localStorage.getItem(HELP_SEEN_KEY)) setTimeout(showHelpModal, 700);
}

function refreshLocaleUI() {
    if (entityFormSection) applyStaticTranslations(entityFormSection);
    if (relFormSection) applyStaticTranslations(relFormSection);
    updateThemeButton();
    updateGraphStats();
    refreshEntityTypeFilter();
    refreshEntityRelTypeFilter();
    refreshEntityList();
    refreshRelLegend();
    const entityId = document.getElementById('entity-id')?.value;
    if (entityId && selectedElement?.isNode?.()) {
        setEntityFormMode('edit');
    } else if (document.getElementById('entity-form-submit')) {
        setEntityFormMode('create');
    }
    const relId = document.getElementById('rel-id')?.value;
    if (relId && selectedElement?.isEdge?.()) {
        setRelFormMode('edit');
    } else if (document.getElementById('rel-form-submit')) {
        setRelFormMode('create-link');
    }
    applySidebarLayoutState();
}

async function init() {
    await initI18n();
    initLocaleSelector();
    window.onLocaleChange = refreshLocaleUI;
    initSidebar();
    initModal();
    initTheme();
    initActionButtons();
    initHistoryControls();
    initKeyboardShortcuts();
    initHelpModal();
    initEntityList();
    initRelLegend();
    initAiExchange();
    initCytoscape();
    applyTheme(currentTheme);
    initZoomControls();
    refreshEntityTypeSelects();
    refreshRelTypeSelects();
    setSidebarTab('create', { silent: true });
    setCreateSubTab('entity');
    loadGraphFromBackend();
    initForms();
}

window.onload = init;
