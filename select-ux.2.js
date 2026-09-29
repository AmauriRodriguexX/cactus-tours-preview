(() => {
	const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
	if (!finePointer.matches) return;

	let nextId = 0;
	let typeahead = '';
	let typeaheadTimer;
	const controls = new Set();

	const normalized = (text) => (text || '').replace(/\s+/g, ' ').trim();

	function fieldLabel(select) {
		const explicit = select.getAttribute('aria-label');
		if (explicit) return explicit;

		const labelledBy = select.getAttribute('aria-labelledby');
		if (labelledBy) return null;

		for (const label of Array.from(select.labels || [])) {
			const copy = label.cloneNode(true);
			copy.querySelectorAll('select, .chev, .msym, [aria-hidden="true"]').forEach((node) => node.remove());
			const text = normalized(copy.textContent);
			if (text) return text;
		}
		const previous = select.previousElementSibling;
		if (previous && !previous.matches('select, .chev, .msym, [aria-hidden="true"]')) {
			const text = normalized(previous.textContent);
			if (text) return text;
		}
		return null;
	}

	function makeIcon() {
		const icon = document.createElement('span');
		icon.className = 'select-ux-chevron';
		icon.setAttribute('aria-hidden', 'true');
		icon.innerHTML = '<svg viewBox="0 0 20 20" width="18" height="18" fill="none"><path d="m5.5 7.5 4.5 4.5 4.5-4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
		return icon;
	}

	function makeCheck() {
		const check = document.createElement('span');
		check.className = 'select-ux-option-check';
		check.setAttribute('aria-hidden', 'true');
		check.innerHTML = '<svg viewBox="0 0 20 20" width="18" height="18" fill="none"><path d="m4.5 10.2 3.5 3.5 7.5-7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
		return check;
	}

	function enhance(select) {
		if (select.dataset.selectUxReady || select.multiple || select.size > 1 || select.options.length < 2) return;

		const selectId = select.id || `ct-select-native-${++nextId}`;
		if (!select.id) select.id = selectId;
		const trigger = document.createElement('button');
		trigger.type = 'button';
		trigger.id = `${selectId}-ux-trigger`;
		trigger.className = `${select.className} select-ux-trigger`.trim();
		trigger.setAttribute('role', 'combobox');
		trigger.setAttribute('aria-haspopup', 'listbox');
		trigger.setAttribute('aria-expanded', 'false');
		trigger.setAttribute('aria-controls', `${selectId}-ux-listbox`);
		trigger.setAttribute('aria-autocomplete', 'none');

		const label = fieldLabel(select);
		if (label) trigger.setAttribute('aria-label', label);
		const labelledBy = select.getAttribute('aria-labelledby');
		if (labelledBy) trigger.setAttribute('aria-labelledby', labelledBy);
		const describedBy = select.getAttribute('aria-describedby');
		if (describedBy) trigger.setAttribute('aria-describedby', describedBy);

		const value = document.createElement('span');
		value.className = 'select-ux-value';
		trigger.append(value, makeIcon());

		const listbox = document.createElement('div');
		listbox.id = `${selectId}-ux-listbox`;
		listbox.className = 'select-ux-menu';
		listbox.setAttribute('role', 'listbox');
		const genericOptionsLabel = document.documentElement.lang.toLowerCase().startsWith('es') ? 'Opciones' : 'Options';
		if (labelledBy) listbox.setAttribute('aria-labelledby', labelledBy);
		else listbox.setAttribute('aria-label', label || genericOptionsLabel);
		listbox.hidden = true;
		document.body.appendChild(listbox);

		const parent = select.parentElement;
		parent.insertBefore(trigger, select);
		select.dataset.selectUxReady = 'true';
		select.classList.add('select-ux-native');
		select.setAttribute('aria-hidden', 'true');
		select.tabIndex = -1;
		if (parent.classList.contains('control-select')) parent.classList.add('select-ux-active');

		const oldChevron = select.nextElementSibling;
		if (oldChevron && (oldChevron.classList.contains('chev') || (oldChevron.classList.contains('msym') && normalized(oldChevron.textContent) === 'expand_more'))) {
			oldChevron.classList.add('select-ux-legacy-chevron');
		}

		for (const associatedLabel of Array.from(select.labels || [])) {
			if (associatedLabel.htmlFor === select.id) associatedLabel.htmlFor = trigger.id;
		}

		let entries = [];
		let activeIndex = -1;

		function positionListbox() {
			if (listbox.hidden) return;
			const rect = trigger.getBoundingClientRect();
			const width = Math.min(Math.max(rect.width, 220), window.innerWidth - 24);
			const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
			const desiredHeight = Math.min(320, Math.max(120, entries.length * 44 + 12));
			const below = window.innerHeight - rect.bottom - 12;
			const above = rect.top - 12;
			const openAbove = below < Math.min(desiredHeight, 210) && above > below;
			const top = openAbove ? Math.max(12, rect.top - Math.min(desiredHeight, above)) : Math.min(window.innerHeight - 12, rect.bottom + 8);
			listbox.style.left = `${left}px`;
			listbox.style.top = `${top}px`;
			listbox.style.width = `${width}px`;
			listbox.style.maxHeight = `${Math.max(80, Math.min(desiredHeight, openAbove ? above : below))}px`;
			listbox.dataset.placement = openAbove ? 'top' : 'bottom';
		}

		function setActive(index, direction = 1, wrap = true) {
			if (!entries.length) return;
			let candidate = Math.max(0, Math.min(entries.length - 1, index));
			let checked = 0;
			while (entries[candidate].disabled && checked < entries.length) {
				candidate += direction;
				if (candidate < 0 || candidate >= entries.length) {
					if (!wrap) return;
					candidate = (candidate + entries.length) % entries.length;
				}
				checked++;
			}
			if (entries[candidate].disabled) return;
			activeIndex = candidate;
			for (const entry of entries) entry.node.classList.toggle('is-active', entry.index === activeIndex);
			trigger.setAttribute('aria-activedescendant', entries[activeIndex].node.id);
			entries[activeIndex].node.scrollIntoView({ block: 'nearest' });
		}

		function syncValue() {
			const triggerClasses = Array.from(select.classList).filter((className) => className !== 'select-ux-native');
			trigger.className = `${triggerClasses.join(' ')} select-ux-trigger`.trim();
			const selected = select.options[select.selectedIndex];
			const selectedText = selected ? normalized(selected.label || selected.textContent) : '';
			value.textContent = selectedText;
			if (selectedText) trigger.setAttribute('aria-valuetext', selectedText);
			else trigger.removeAttribute('aria-valuetext');
			trigger.disabled = select.disabled;
			if (select.required) trigger.setAttribute('aria-required', 'true');
			else trigger.removeAttribute('aria-required');
			const invalid = select.getAttribute('aria-invalid');
			if (invalid) trigger.setAttribute('aria-invalid', invalid);
			else trigger.removeAttribute('aria-invalid');
			for (const attribute of ['aria-describedby', 'aria-errormessage']) {
				const attributeValue = select.getAttribute(attribute);
				if (attributeValue) trigger.setAttribute(attribute, attributeValue);
				else trigger.removeAttribute(attribute);
			}
			for (const entry of entries) {
				const isSelected = entry.index === select.selectedIndex;
				entry.node.setAttribute('aria-selected', String(isSelected));
			}
			if (select.disabled && !listbox.hidden) close();
		}

		function buildOptions() {
			listbox.replaceChildren();
			entries = [];
			let previousGroup = null;
			Array.from(select.options).forEach((option, index) => {
				const group = option.parentElement?.tagName === 'OPTGROUP' ? option.parentElement : null;
				if (group && group.label !== previousGroup) {
					const heading = document.createElement('div');
					heading.className = 'select-ux-group-label';
					heading.setAttribute('role', 'presentation');
					heading.textContent = group.label;
					listbox.appendChild(heading);
				}
				previousGroup = group ? group.label : null;

				const item = document.createElement('div');
				item.id = `${listbox.id}-option-${index}`;
				item.className = 'select-ux-option';
				item.setAttribute('role', 'option');
				item.setAttribute('aria-selected', 'false');
				const isDisabled = option.disabled || Boolean(group?.disabled);
				if (isDisabled) item.setAttribute('aria-disabled', 'true');
				const labelNode = document.createElement('span');
				labelNode.className = 'select-ux-option-label';
				labelNode.textContent = normalized(option.label || option.textContent);
				item.append(labelNode, makeCheck());
				item.addEventListener('pointerenter', () => { if (!isDisabled) setActive(index); });
				item.addEventListener('click', (event) => {
					event.preventDefault();
					event.stopPropagation();
					if (!isDisabled) choose(index);
				});
				listbox.appendChild(item);
				entries.push({ index, node: item, disabled: isDisabled, text: normalized(option.label || option.textContent).toLocaleLowerCase() });
			});
			syncValue();
		}

		function open() {
			if (trigger.disabled || !entries.length) return;
			listbox.hidden = false;
			trigger.setAttribute('aria-expanded', 'true');
			positionListbox();
			const selected = entries.findIndex((entry) => entry.index === select.selectedIndex && !entry.disabled);
			setActive(selected >= 0 ? selected : 0, 1, true);
		}

		function close(restoreFocus = false) {
			listbox.hidden = true;
			trigger.setAttribute('aria-expanded', 'false');
			trigger.removeAttribute('aria-activedescendant');
			for (const entry of entries) entry.node.classList.remove('is-active');
			if (restoreFocus) trigger.focus({ preventScroll: true });
		}

		function choose(index) {
			if (!entries[index] || entries[index].disabled) return;
			const changed = select.selectedIndex !== index;
			select.selectedIndex = index;
			syncValue();
			close(true);
			if (changed) {
				select.dispatchEvent(new Event('input', { bubbles: true }));
				select.dispatchEvent(new Event('change', { bubbles: true }));
			}
		}

		function findPrefix(prefix) {
			const start = entries.findIndex((entry) => entry.index === select.selectedIndex);
			for (let offset = 1; offset <= entries.length; offset++) {
				const candidate = entries[(start + offset) % entries.length];
				if (!candidate.disabled && candidate.text.startsWith(prefix)) return candidate.index;
			}
			return -1;
		}

		trigger.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			if (listbox.hidden) open(); else close();
		});

		trigger.addEventListener('keydown', (event) => {
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				event.preventDefault();
				if (listbox.hidden) open();
				else {
					const direction = event.key === 'ArrowDown' ? 1 : -1;
					setActive(activeIndex + direction, direction, true);
				}
				return;
			}
			if (event.key === 'Home' || event.key === 'End') {
				if (!listbox.hidden) {
					event.preventDefault();
					setActive(event.key === 'Home' ? 0 : entries.length - 1, event.key === 'Home' ? 1 : -1, false);
				}
				return;
			}
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				if (listbox.hidden) open(); else if (activeIndex >= 0) choose(activeIndex);
				return;
			}
			if (event.key === 'Escape' && !listbox.hidden) {
				event.preventDefault();
				close(true);
				return;
			}
			if (event.key === 'Tab' && !listbox.hidden) close();
			if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
				typeahead += event.key.toLocaleLowerCase();
				window.clearTimeout(typeaheadTimer);
				typeaheadTimer = window.setTimeout(() => { typeahead = ''; }, 650);
				const match = findPrefix(typeahead);
				if (match >= 0) {
					if (listbox.hidden) open();
					setActive(match);
				}
			}
		});

		select.addEventListener('change', syncValue);
		select.addEventListener('input', syncValue);
		select.addEventListener('invalid', (event) => {
			event.preventDefault();
			trigger.setAttribute('aria-invalid', 'true');
			trigger.focus({ preventScroll: true });
			open();
		});
		select.form?.addEventListener('reset', () => window.setTimeout(syncValue, 0));

		for (const labelElement of Array.from(select.labels || [])) {
			labelElement.addEventListener('click', (event) => {
				if (trigger.contains(event.target)) return;
				event.preventDefault();
				trigger.focus({ preventScroll: true });
				open();
			});
		}

		buildOptions();
		const optionObserver = new MutationObserver(buildOptions);
		optionObserver.observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-describedby', 'aria-errormessage', 'aria-invalid', 'class', 'disabled', 'label', 'required', 'selected', 'value'] });

		const controller = {
			select,
			trigger,
			listbox,
			close,
			positionListbox,
			destroy() {
				optionObserver.disconnect();
				trigger.remove();
				listbox.remove();
				select.classList.remove('select-ux-native');
				select.removeAttribute('aria-hidden');
				select.removeAttribute('data-select-ux-ready');
				select.removeAttribute('tabindex');
				if (!parent.querySelector('.select-ux-trigger')) parent.classList.remove('select-ux-active');
			}
		};
		controls.add(controller);
		return controller;
	}

	function enhanceWithin(root) {
		if (root instanceof HTMLSelectElement) enhance(root);
		root.querySelectorAll?.('select').forEach(enhance);
	}

	document.addEventListener('pointerdown', (event) => {
		for (const control of controls) {
			if (!control.listbox.hidden && !control.listbox.contains(event.target) && !control.trigger.contains(event.target)) control.close();
		}
	}, true);

	window.addEventListener('scroll', () => {
		for (const control of controls) if (!control.listbox.hidden) control.positionListbox();
	}, true);
	window.addEventListener('resize', () => {
		for (const control of controls) if (!control.listbox.hidden) control.positionListbox();
	});

	function start() {
		enhanceWithin(document.body);
		const observer = new MutationObserver((records) => {
			for (const record of records) {
				for (const node of record.addedNodes) if (node.nodeType === Node.ELEMENT_NODE) enhanceWithin(node);
			}
			for (const control of Array.from(controls)) {
				if (!control.select.isConnected) {
					control.destroy();
					controls.delete(control);
				}
			}
		});
		observer.observe(document.body, { childList: true, subtree: true });
	}

	if (document.readyState === 'complete') window.setTimeout(start, 250);
	else window.addEventListener('load', () => window.setTimeout(start, 250), { once: true });
})();
