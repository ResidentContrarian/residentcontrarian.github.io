(function () {
    'use strict';

    function noop() { }
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        if (definition[2] && fn) {
            const lets = definition[2](fn(dirty));
            if ($$scope.dirty === undefined) {
                return lets;
            }
            if (typeof lets === 'object') {
                const merged = [];
                const len = Math.max($$scope.dirty.length, lets.length);
                for (let i = 0; i < len; i += 1) {
                    merged[i] = $$scope.dirty[i] | lets[i];
                }
                return merged;
            }
            return $$scope.dirty | lets;
        }
        return $$scope.dirty;
    }
    function update_slot_base(slot, slot_definition, ctx, $$scope, slot_changes, get_slot_context_fn) {
        if (slot_changes) {
            const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
            slot.p(slot_context, slot_changes);
        }
    }
    function get_all_dirty_from_scope($$scope) {
        if ($$scope.ctx.length > 32) {
            const dirty = [];
            const length = $$scope.ctx.length / 32;
            for (let i = 0; i < length; i++) {
                dirty[i] = -1;
            }
            return dirty;
        }
        return -1;
    }
    function set_store_value(store, ret, value) {
        store.set(value);
        return ret;
    }
    function append(target, node) {
        target.appendChild(node);
    }
    function append_styles(target, style_sheet_id, styles) {
        const append_styles_to = get_root_for_style(target);
        if (!append_styles_to.getElementById(style_sheet_id)) {
            const style = element('style');
            style.id = style_sheet_id;
            style.textContent = styles;
            append_stylesheet(append_styles_to, style);
        }
    }
    function get_root_for_style(node) {
        if (!node)
            return document;
        const root = node.getRootNode ? node.getRootNode() : node.ownerDocument;
        if (root && root.host) {
            return root;
        }
        return node.ownerDocument;
    }
    function append_stylesheet(node, style) {
        append(node.head || node, style);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.wholeText !== data)
            text.data = data;
    }
    function set_style(node, key, value, important) {
        if (value === null) {
            node.style.removeProperty(key);
        }
        else {
            node.style.setProperty(key, value, important ? 'important' : '');
        }
    }
    function custom_event(type, detail, bubbles = false) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, bubbles, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }
    function setContext(key, context) {
        get_current_component().$$.context.set(key, context);
    }
    function getContext(key) {
        return get_current_component().$$.context.get(key);
    }
    // TODO figure out if we still want to support
    // shorthand events, or if we want to implement
    // a real bubbling mechanism
    function bubble(component, event) {
        const callbacks = component.$$.callbacks[event.type];
        if (callbacks) {
            // @ts-ignore
            callbacks.slice().forEach(fn => fn.call(this, event));
        }
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    // flush() calls callbacks in this order:
    // 1. All beforeUpdate callbacks, in order: parents before children
    // 2. All bind:this callbacks, in reverse order: children before parents.
    // 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
    //    for afterUpdates called during the initial onMount, which are called in
    //    reverse order: children before parents.
    // Since callbacks might update component values, which could trigger another
    // call to flush(), the following steps guard against this:
    // 1. During beforeUpdate, any updated components will be added to the
    //    dirty_components array and will cause a reentrant call to flush(). Because
    //    the flush index is kept outside the function, the reentrant call will pick
    //    up where the earlier call left off and go through all dirty components. The
    //    current_component value is saved and restored so that the reentrant call will
    //    not interfere with the "parent" flush() call.
    // 2. bind:this callbacks cannot trigger new flush() calls.
    // 3. During afterUpdate, any updated components will NOT have their afterUpdate
    //    callback called a second time; the seen_callbacks set, outside the flush()
    //    function, guarantees this behavior.
    const seen_callbacks = new Set();
    let flushidx = 0; // Do *not* move this inside the flush() function
    function flush() {
        const saved_component = current_component;
        do {
            // first, call beforeUpdate functions
            // and update components
            while (flushidx < dirty_components.length) {
                const component = dirty_components[flushidx];
                flushidx++;
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            flushidx = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        seen_callbacks.clear();
        set_current_component(saved_component);
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = on_mount.map(run).filter(is_function);
                if (on_destroy) {
                    on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false,
            root: options.target || parent_component.$$.root
        };
        append_styles && append_styles($$.root);
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    const subscriber_queue = [];
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = new Set();
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (const subscriber of subscribers) {
                        subscriber[1]();
                        subscriber_queue.push(subscriber, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.add(subscriber);
            if (subscribers.size === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                subscribers.delete(subscriber);
                if (subscribers.size === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }

    // from https://codereview.stackexchange.com/a/132140/8591

    const input = `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789`;
    const output = `NOPQRSTUVWXYZABCDEFGHIJKLMnopqrstuvwxyzabcdefghijklm5678901234`;
    const index = x => input.indexOf(x);
    const translate = x => index(x) > -1 ? output[index(x)] : x;

    var rot13 = str => str.split(``).map(translate).join(``);

    const to_obfuscated_json = value => rot13(JSON.stringify(value));
    const from_obfuscated_json = string => {
    	if (!string) {
    		return {}
    	}

    	try {
    		return JSON.parse(rot13(string))
    	} catch (err) {
    		console.error(err);
    		return {}
    	}
    };

    /* cyoa\Link.svelte generated by Svelte v3.47.0 */

    function add_css$9(target) {
    	append_styles(target, "svelte-126xavi", "a.svelte-126xavi,p.svelte-126xavi{white-space:normal;padding:4px 0}");
    }

    // (50:0) {:else}
    function create_else_block$4(ctx) {
    	let p;
    	let t0;
    	let span1;
    	let t1;
    	let span0;
    	let t2;
    	let t3;
    	let current;
    	const default_slot_template = /*#slots*/ ctx[11].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[10], null);

    	return {
    		c() {
    			p = element("p");
    			if (default_slot) default_slot.c();
    			t0 = space();
    			span1 = element("span");
    			t1 = text("(There is no page named \"");
    			span0 = element("span");
    			t2 = text(/*target_page*/ ctx[0]);
    			t3 = text("\")");
    			set_style(span0, "font-family", "monospace");
    			set_style(span1, "color", "red");
    			attr(p, "class", "svelte-126xavi");
    		},
    		m(target, anchor) {
    			insert(target, p, anchor);

    			if (default_slot) {
    				default_slot.m(p, null);
    			}

    			append(p, t0);
    			append(p, span1);
    			append(span1, t1);
    			append(span1, span0);
    			append(span0, t2);
    			append(span1, t3);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 1024)) {
    					update_slot_base(
    						default_slot,
    						default_slot_template,
    						ctx,
    						/*$$scope*/ ctx[10],
    						!current
    						? get_all_dirty_from_scope(/*$$scope*/ ctx[10])
    						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[10], dirty, null),
    						null
    					);
    				}
    			}

    			if (!current || dirty & /*target_page*/ 1) set_data(t2, /*target_page*/ ctx[0]);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(p);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    // (43:0) {#if link_target_id}
    function create_if_block$5(ctx) {
    	let a;
    	let a_href_value;
    	let current;
    	let mounted;
    	let dispose;
    	const default_slot_template = /*#slots*/ ctx[11].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[10], null);

    	return {
    		c() {
    			a = element("a");
    			if (default_slot) default_slot.c();
    			attr(a, "href", a_href_value = "#?page=" + /*link_target_id*/ ctx[1] + "&state=" + to_obfuscated_json(/*target_state*/ ctx[2]));
    			attr(a, "class", "svelte-126xavi");
    		},
    		m(target, anchor) {
    			insert(target, a, anchor);

    			if (default_slot) {
    				default_slot.m(a, null);
    			}

    			current = true;

    			if (!mounted) {
    				dispose = listen(a, "click", /*on_click*/ ctx[5]);
    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 1024)) {
    					update_slot_base(
    						default_slot,
    						default_slot_template,
    						ctx,
    						/*$$scope*/ ctx[10],
    						!current
    						? get_all_dirty_from_scope(/*$$scope*/ ctx[10])
    						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[10], dirty, null),
    						null
    					);
    				}
    			}

    			if (!current || dirty & /*link_target_id, target_state*/ 6 && a_href_value !== (a_href_value = "#?page=" + /*link_target_id*/ ctx[1] + "&state=" + to_obfuscated_json(/*target_state*/ ctx[2]))) {
    				attr(a, "href", a_href_value);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(a);
    			if (default_slot) default_slot.d(detaching);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function create_fragment$O(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block$5, create_else_block$4];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*link_target_id*/ ctx[1]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				} else {
    					if_block.p(ctx, dirty);
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function instance$O($$self, $$props, $$invalidate) {
    	let target_state;
    	let target_page;
    	let link_target_id;
    	let $adventure_state;
    	let $current_page_name;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	const current_page_name = getContext(`current_page_name`);
    	component_subscribe($$self, current_page_name, value => $$invalidate(9, $current_page_name = value));
    	const adventure_state = getContext(`adventure_state`);
    	component_subscribe($$self, adventure_state, value => $$invalidate(8, $adventure_state = value));
    	let { to = null } = $$props;
    	let { state = null } = $$props;
    	const is_left_click = event => event.button === 0;
    	const is_modified_by_key_press = event => !!(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey);
    	const should_intercept_click = event => !event.defaultPrevented && !is_modified_by_key_press(event) && is_left_click(event);
    	const name_to_id = getContext(`name_to_id`);

    	const on_click = event => {
    		if (should_intercept_click(event)) {
    			set_store_value(current_page_name, $current_page_name = target_page, $current_page_name);
    			set_store_value(adventure_state, $adventure_state = target_state, $adventure_state);
    			event.preventDefault();
    		}
    	};

    	$$self.$$set = $$props => {
    		if ('to' in $$props) $$invalidate(6, to = $$props.to);
    		if ('state' in $$props) $$invalidate(7, state = $$props.state);
    		if ('$$scope' in $$props) $$invalidate(10, $$scope = $$props.$$scope);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*state, $adventure_state*/ 384) {
    			$$invalidate(2, target_state = state === null ? $adventure_state : state);
    		}

    		if ($$self.$$.dirty & /*to, $current_page_name*/ 576) {
    			$$invalidate(0, target_page = to === null ? $current_page_name : to);
    		}

    		if ($$self.$$.dirty & /*target_page*/ 1) {
    			$$invalidate(1, link_target_id = name_to_id[target_page]);
    		}

    		if ($$self.$$.dirty & /*link_target_id, target_page*/ 3) {
    			link_target_id || console.error(`No component found named`, target_page);
    		}
    	};

    	return [
    		target_page,
    		link_target_id,
    		target_state,
    		current_page_name,
    		adventure_state,
    		on_click,
    		to,
    		state,
    		$adventure_state,
    		$current_page_name,
    		$$scope,
    		slots
    	];
    }

    class Link extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$O, create_fragment$O, safe_not_equal, { to: 6, state: 7 }, add_css$9);
    	}
    }

    /* cyoa\Wrapper.svelte generated by Svelte v3.47.0 */

    function add_css$8(target) {
    	append_styles(target, "svelte-1ufcsq2", "*{margin:0;box-sizing:border-box}body{color:#333;margin:0;padding:0;box-sizing:border-box;font-family:-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Oxygen-Sans, Ubuntu, Cantarell, \"Helvetica Neue\", sans-serif}");
    }

    // (39:0) <Container   {Link}   state={adventure_state}   {current_page_name}  >
    function create_default_slot$J(ctx) {
    	let switch_instance;
    	let switch_instance_anchor;
    	let current;
    	var switch_value = /*current_page_component*/ ctx[3];

    	function switch_props(ctx) {
    		return {
    			props: { Link, state: /*adventure_state*/ ctx[2] }
    		};
    	}

    	if (switch_value) {
    		switch_instance = new switch_value(switch_props(ctx));
    	}

    	return {
    		c() {
    			if (switch_instance) create_component(switch_instance.$$.fragment);
    			switch_instance_anchor = empty();
    		},
    		m(target, anchor) {
    			if (switch_instance) {
    				mount_component(switch_instance, target, anchor);
    			}

    			insert(target, switch_instance_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const switch_instance_changes = {};
    			if (dirty & /*adventure_state*/ 4) switch_instance_changes.state = /*adventure_state*/ ctx[2];

    			if (switch_value !== (switch_value = /*current_page_component*/ ctx[3])) {
    				if (switch_instance) {
    					group_outros();
    					const old_component = switch_instance;

    					transition_out(old_component.$$.fragment, 1, 0, () => {
    						destroy_component(old_component, 1);
    					});

    					check_outros();
    				}

    				if (switch_value) {
    					switch_instance = new switch_value(switch_props(ctx));
    					create_component(switch_instance.$$.fragment);
    					transition_in(switch_instance.$$.fragment, 1);
    					mount_component(switch_instance, switch_instance_anchor.parentNode, switch_instance_anchor);
    				} else {
    					switch_instance = null;
    				}
    			} else if (switch_value) {
    				switch_instance.$set(switch_instance_changes);
    			}
    		},
    		i(local) {
    			if (current) return;
    			if (switch_instance) transition_in(switch_instance.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			if (switch_instance) transition_out(switch_instance.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(switch_instance_anchor);
    			if (switch_instance) destroy_component(switch_instance, detaching);
    		}
    	};
    }

    function create_fragment$N(ctx) {
    	let container;
    	let current;

    	container = new /*Container*/ ctx[0]({
    			props: {
    				Link,
    				state: /*adventure_state*/ ctx[2],
    				current_page_name: /*current_page_name*/ ctx[4],
    				$$slots: { default: [create_default_slot$J] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(container.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(container, target, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const container_changes = {};
    			if (dirty & /*adventure_state*/ 4) container_changes.state = /*adventure_state*/ ctx[2];

    			if (dirty & /*$$scope, current_page_component, adventure_state*/ 4108) {
    				container_changes.$$scope = { dirty, ctx };
    			}

    			container.$set(container_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(container.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(container.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(container, detaching);
    		}
    	};
    }

    function instance$N($$self, $$props, $$invalidate) {
    	let current_page_id;
    	let current_page_component;
    	let $current_page_name;

    	let $page_id_param,
    		$$unsubscribe_page_id_param = noop,
    		$$subscribe_page_id_param = () => ($$unsubscribe_page_id_param(), $$unsubscribe_page_id_param = subscribe(page_id_param, $$value => $$invalidate(10, $page_id_param = $$value)), page_id_param);

    	$$self.$$.on_destroy.push(() => $$unsubscribe_page_id_param());
    	let { Container } = $$props;
    	let { name_to_id } = $$props;
    	let { id_to_name } = $$props;
    	let { id_to_component } = $$props;
    	let { page_id_param } = $$props;
    	$$subscribe_page_id_param();
    	let { adventure_state } = $$props;

    	const update_current_page = page_id => {
    		const new_page_name = id_to_name[page_id];

    		if (!new_page_name) {
    			throw new Error(`No such page "${new_page_name}"`);
    		}

    		set_store_value(current_page_name, $current_page_name = new_page_name, $current_page_name);
    	};

    	const current_page_name = writable();
    	component_subscribe($$self, current_page_name, value => $$invalidate(9, $current_page_name = value));
    	set_store_value(current_page_name, $current_page_name = id_to_name[$page_id_param] || `Start`, $current_page_name);
    	setContext(`name_to_id`, name_to_id);
    	setContext(`current_page_name`, current_page_name);
    	setContext(`adventure_state`, adventure_state);

    	$$self.$$set = $$props => {
    		if ('Container' in $$props) $$invalidate(0, Container = $$props.Container);
    		if ('name_to_id' in $$props) $$invalidate(5, name_to_id = $$props.name_to_id);
    		if ('id_to_name' in $$props) $$invalidate(6, id_to_name = $$props.id_to_name);
    		if ('id_to_component' in $$props) $$invalidate(7, id_to_component = $$props.id_to_component);
    		if ('page_id_param' in $$props) $$subscribe_page_id_param($$invalidate(1, page_id_param = $$props.page_id_param));
    		if ('adventure_state' in $$props) $$invalidate(2, adventure_state = $$props.adventure_state);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*name_to_id, $current_page_name*/ 544) {
    			set_store_value(page_id_param, $page_id_param = name_to_id[$current_page_name], $page_id_param);
    		}

    		if ($$self.$$.dirty & /*$page_id_param*/ 1024) {
    			update_current_page($page_id_param);
    		}

    		if ($$self.$$.dirty & /*name_to_id, $current_page_name*/ 544) {
    			$$invalidate(8, current_page_id = name_to_id[$current_page_name]);
    		}

    		if ($$self.$$.dirty & /*id_to_component, current_page_id*/ 384) {
    			$$invalidate(3, current_page_component = id_to_component[current_page_id]);
    		}
    	};

    	return [
    		Container,
    		page_id_param,
    		adventure_state,
    		current_page_component,
    		current_page_name,
    		name_to_id,
    		id_to_name,
    		id_to_component,
    		current_page_id,
    		$current_page_name,
    		$page_id_param
    	];
    }

    class Wrapper extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(
    			this,
    			options,
    			instance$N,
    			create_fragment$N,
    			safe_not_equal,
    			{
    				Container: 0,
    				name_to_id: 5,
    				id_to_name: 6,
    				id_to_component: 7,
    				page_id_param: 1,
    				adventure_state: 2
    			},
    			add_css$8
    		);
    	}
    }

    const get_params_string_from_browser = () => location.hash.replace(/^#/, ``);

    const get_param = key => new URLSearchParams(get_params_string_from_browser()).get(key);
    const push_param = (key, value) => {
    	const params = new URLSearchParams(get_params_string_from_browser());
    	params.set(key, value);
    	location.hash = params.toString();
    };
    const replace_param = (key, value) => {
    	const params = new URLSearchParams(get_params_string_from_browser());
    	params.set(key, value);
    	history.replaceState({}, ``, `#` + params.toString());
    };

    const param_store = ({ param_name, replace = false, initial_value = get_param(param_name) }) => {
    	const { subscribe, set } = writable(initial_value);

    	const set_param = replace ? replace_param : push_param;

    	set_param(param_name, initial_value);

    	const change_listener = () => {
    		set(get_param(param_name));
    	};

    	window.addEventListener(`hashchange`, change_listener);

    	return {
    		subscribe(cb) {
    			const unsubscribe = subscribe(cb);
    			return () => {
    				window.removeEventListener(`hashchange`, change_listener);
    				unsubscribe();
    			}
    		},
    		set(value) {
    			set_param(param_name, value);
    			set(value);
    		},
    	}
    };

    const object_serializer_store = ({
    	param_name,
    	replace,
    	default_values,
    	serialize,
    	deserialize,
    }) => {
    	const { subscribe, set } = param_store({
    		param_name,
    		replace,
    		initial_value: serialize({
    			...default_values,
    			...deserialize(get_param(param_name)),
    		}),
    	});

    	return {
    		subscribe(cb) {
    			const translator = serialized_value => {
    				const value = deserialize(serialized_value);
    				cb(value);
    			};
    			return subscribe(translator)
    		},
    		set(value) {
    			set(serialize(value));
    		},
    	}
    };

    /* adventure\helpers\Action.svelte generated by Svelte v3.47.0 */

    function add_css$7(target) {
    	append_styles(target, "svelte-16nchpc", ".icon.svelte-16nchpc.svelte-16nchpc{color:var(--gray)}[data-selected=true].svelte-16nchpc .icon.svelte-16nchpc{color:var(--green)}button.svelte-16nchpc.svelte-16nchpc{cursor:pointer;color:var(--blue);text-decoration:underline;border:0;padding:0;background-color:transparent;font-size:initial}.slot.svelte-16nchpc.svelte-16nchpc{display:inline-flex;flex-direction:column;gap:8px}");
    }

    // (21:2) {:else}
    function create_else_block$3(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("▶");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (19:2) {#if selected}
    function create_if_block_1$4(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("✔");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (25:48) {#if selected}
    function create_if_block$4(ctx) {
    	let span;
    	let current;
    	const default_slot_template = /*#slots*/ ctx[4].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[3], null);

    	return {
    		c() {
    			span = element("span");
    			if (default_slot) default_slot.c();
    			attr(span, "class", "slot svelte-16nchpc");
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);

    			if (default_slot) {
    				default_slot.m(span, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 8)) {
    					update_slot_base(
    						default_slot,
    						default_slot_template,
    						ctx,
    						/*$$scope*/ ctx[3],
    						!current
    						? get_all_dirty_from_scope(/*$$scope*/ ctx[3])
    						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[3], dirty, null),
    						null
    					);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function create_fragment$M(ctx) {
    	let div;
    	let span;
    	let t0;
    	let button;
    	let t1;
    	let t2;
    	let current;
    	let mounted;
    	let dispose;

    	function select_block_type(ctx, dirty) {
    		if (/*selected*/ ctx[0]) return create_if_block_1$4;
    		return create_else_block$3;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block0 = current_block_type(ctx);
    	let if_block1 = /*selected*/ ctx[0] && create_if_block$4(ctx);

    	return {
    		c() {
    			div = element("div");
    			span = element("span");
    			if_block0.c();
    			t0 = space();
    			button = element("button");
    			t1 = text(/*summary*/ ctx[1]);
    			t2 = space();
    			if (if_block1) if_block1.c();
    			attr(span, "class", "icon svelte-16nchpc");
    			attr(button, "class", "svelte-16nchpc");
    			attr(div, "data-selected", /*selected*/ ctx[0]);
    			attr(div, "class", "svelte-16nchpc");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, span);
    			if_block0.m(span, null);
    			append(div, t0);
    			append(div, button);
    			append(button, t1);
    			append(div, t2);
    			if (if_block1) if_block1.m(div, null);
    			current = true;

    			if (!mounted) {
    				dispose = listen(button, "click", /*on_click*/ ctx[2]);
    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (current_block_type !== (current_block_type = select_block_type(ctx))) {
    				if_block0.d(1);
    				if_block0 = current_block_type(ctx);

    				if (if_block0) {
    					if_block0.c();
    					if_block0.m(span, null);
    				}
    			}

    			if (!current || dirty & /*summary*/ 2) set_data(t1, /*summary*/ ctx[1]);

    			if (/*selected*/ ctx[0]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty & /*selected*/ 1) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block$4(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div, null);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (!current || dirty & /*selected*/ 1) {
    				attr(div, "data-selected", /*selected*/ ctx[0]);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block1);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block1);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if_block0.d();
    			if (if_block1) if_block1.d();
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance$M($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	const dispatch = createEventDispatcher();
    	let { summary } = $$props;
    	let { selected = false } = $$props;

    	const on_click = () => {
    		if (!selected) {
    			$$invalidate(0, selected = true);
    			dispatch(`select`);
    		}
    	};

    	$$self.$$set = $$props => {
    		if ('summary' in $$props) $$invalidate(1, summary = $$props.summary);
    		if ('selected' in $$props) $$invalidate(0, selected = $$props.selected);
    		if ('$$scope' in $$props) $$invalidate(3, $$scope = $$props.$$scope);
    	};

    	return [selected, summary, on_click, $$scope, slots];
    }

    class Action extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$M, create_fragment$M, safe_not_equal, { summary: 1, selected: 0 }, add_css$7);
    	}
    }

    var adventure$47$helpers$47$Action$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Action
    });

    /* adventure\helpers\Blue.svelte generated by Svelte v3.47.0 */

    function add_css$6(target) {
    	append_styles(target, "svelte-1la2b0z", "p.svelte-1la2b0z{color:var(--blue)}");
    }

    function create_fragment$L(ctx) {
    	let p;
    	let t;
    	let current;
    	const default_slot_template = /*#slots*/ ctx[1].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[0], null);

    	return {
    		c() {
    			p = element("p");
    			t = text("> ");
    			if (default_slot) default_slot.c();
    			attr(p, "class", "svelte-1la2b0z");
    		},
    		m(target, anchor) {
    			insert(target, p, anchor);
    			append(p, t);

    			if (default_slot) {
    				default_slot.m(p, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 1)) {
    					update_slot_base(
    						default_slot,
    						default_slot_template,
    						ctx,
    						/*$$scope*/ ctx[0],
    						!current
    						? get_all_dirty_from_scope(/*$$scope*/ ctx[0])
    						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[0], dirty, null),
    						null
    					);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(p);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$L($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;

    	$$self.$$set = $$props => {
    		if ('$$scope' in $$props) $$invalidate(0, $$scope = $$props.$$scope);
    	};

    	return [$$scope, slots];
    }

    class Blue extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$L, create_fragment$L, safe_not_equal, {}, add_css$6);
    	}
    }

    var adventure$47$helpers$47$Blue$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Blue
    });

    /* adventure\helpers\Exits.svelte generated by Svelte v3.47.0 */

    function add_css$5(target) {
    	append_styles(target, "svelte-4bekk0", "h3.svelte-4bekk0{border-top:1px solid var(--gray);padding:8px 0}.exits-list.svelte-4bekk0{display:flex;flex-direction:column;gap:8px}");
    }

    function create_fragment$K(ctx) {
    	let div1;
    	let h3;
    	let t1;
    	let div0;
    	let current;
    	const default_slot_template = /*#slots*/ ctx[1].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[0], null);

    	return {
    		c() {
    			div1 = element("div");
    			h3 = element("h3");
    			h3.textContent = "Exits";
    			t1 = space();
    			div0 = element("div");
    			if (default_slot) default_slot.c();
    			attr(h3, "class", "svelte-4bekk0");
    			attr(div0, "class", "exits-list svelte-4bekk0");
    		},
    		m(target, anchor) {
    			insert(target, div1, anchor);
    			append(div1, h3);
    			append(div1, t1);
    			append(div1, div0);

    			if (default_slot) {
    				default_slot.m(div0, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 1)) {
    					update_slot_base(
    						default_slot,
    						default_slot_template,
    						ctx,
    						/*$$scope*/ ctx[0],
    						!current
    						? get_all_dirty_from_scope(/*$$scope*/ ctx[0])
    						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[0], dirty, null),
    						null
    					);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div1);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$K($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;

    	$$self.$$set = $$props => {
    		if ('$$scope' in $$props) $$invalidate(0, $$scope = $$props.$$scope);
    	};

    	return [$$scope, slots];
    }

    class Exits extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$K, create_fragment$K, safe_not_equal, {}, add_css$5);
    	}
    }

    var adventure$47$helpers$47$Exits$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Exits
    });

    /* adventure\Absolutes.svelte generated by Svelte v3.47.0 */

    function create_default_slot_2$k(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("No, I don't think morality works off an abstract list like that.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (17:1) <Link to=detrack>
    function create_default_slot_1$I(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Yes, that's how morality works; some wrong things carry their wrongness with them.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (15:0) <Exits>
    function create_default_slot$I(ctx) {
    	let link0;
    	let t;
    	let link1;
    	let current;

    	link0 = new /*Link*/ ctx[0]({
    			props: {
    				to: "contrack",
    				$$slots: { default: [create_default_slot_2$k] },
    				$$scope: { ctx }
    			}
    		});

    	link1 = new /*Link*/ ctx[0]({
    			props: {
    				to: "detrack",
    				$$slots: { default: [create_default_slot_1$I] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link0.$$.fragment);
    			t = space();
    			create_component(link1.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link0, target, anchor);
    			insert(target, t, anchor);
    			mount_component(link1, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link0_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link0_changes.$$scope = { dirty, ctx };
    			}

    			link0.$set(link0_changes);
    			const link1_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link1_changes.$$scope = { dirty, ctx };
    			}

    			link1.$set(link1_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link0.$$.fragment, local);
    			transition_in(link1.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link0.$$.fragment, local);
    			transition_out(link1.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link0, detaching);
    			if (detaching) detach(t);
    			destroy_component(link1, detaching);
    		}
    	};
    }

    function create_fragment$J(ctx) {
    	let p;
    	let t1;
    	let exits;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$I] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			p = element("p");
    			p.textContent = "Do you think that lying is wrong in an absolute sense? I'm not saying \"it's wrong because it always works out to be a net negative, and net negatives are wrong\"; Do you think it's wrong to lie, even when the consequences would be positive? That's it's wrong in an abstract sense, as if it's baked into the definitions of the universe or deemed that way by an ultimate authority of some kind?";
    			t1 = space();
    			create_component(exits.$$.fragment);
    		},
    		m(target, anchor) {
    			insert(target, p, anchor);
    			insert(target, t1, anchor);
    			mount_component(exits, target, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(p);
    			if (detaching) detach(t1);
    			destroy_component(exits, detaching);
    		}
    	};
    }

    function instance$J($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Absolutes extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$J, create_fragment$J, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$Absolutes$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Absolutes
    });

    /* adventure\Antide.svelte generated by Svelte v3.47.0 */

    function create_default_slot_2$j(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("here");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (35:1) <Link to=Start>
    function create_default_slot_1$H(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("I want to try again, and I've ignored the \"here\" link above! Back to the top!");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (34:0) <Exits>
    function create_default_slot$H(ctx) {
    	let link;
    	let current;

    	link = new /*Link*/ ctx[0]({
    			props: {
    				to: "Start",
    				$$slots: { default: [create_default_slot_1$H] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link_changes.$$scope = { dirty, ctx };
    			}

    			link.$set(link_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link, detaching);
    		}
    	};
    }

    function create_fragment$I(ctx) {
    	let h20;
    	let t0;
    	let p0;
    	let t2;
    	let p1;
    	let t4;
    	let p2;
    	let t6;
    	let p3;
    	let t7;
    	let link;
    	let t8;
    	let t9;
    	let p4;
    	let t11;
    	let h21;
    	let t13;
    	let p5;
    	let t17;
    	let p6;
    	let t19;
    	let p7;
    	let t21;
    	let exits;
    	let t22;
    	let a;
    	let current;

    	link = new /*Link*/ ctx[0]({
    			props: {
    				to: "detrack",
    				$$slots: { default: [create_default_slot_2$j] },
    				$$scope: { ctx }
    			}
    		});

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$H] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			h20 = element("h2");
    			t0 = space();
    			p0 = element("p");
    			p0.textContent = "OK, you chose one of the weird tracks. What happens from here is at least partially your own fault.";
    			t2 = space();
    			p1 = element("p");
    			p1.textContent = "Imagine you hear a knock at your door, and you open it up to find your stoop occupied by a group of Izans, which are backwards Nazis. They want to tell them where a nearby fugitive group of Jews are, so they can take them to their futuristic utopian city and help them thrive while enjoying perfect freedom and friendship. This is good timing, because there's actual Nazis in the neighborhood; if you don't tell the Izans where the family is hiding, the Nazis will probably get to them first and kill them.";
    			t4 = space();
    			p2 = element("p");
    			p2.textContent = "Do you...";
    			t6 = space();
    			p3 = element("p");
    			t7 = text("You know what? No. This is dumb. Not because of your morality system but because this is going to be exactly the same as the deontology track. You can just go ");
    			create_component(link.$$.fragment);
    			t8 = text(" and palette-swap everything to fit your weird pro-lying deontology preference, and I save four hours.");
    			t9 = space();
    			p4 = element("p");
    			p4.textContent = "I understand that this might make you feel shortchanged, so:";
    			t11 = space();
    			h21 = element("h2");
    			h21.textContent = "You are a Madlibs Honesty Obstructionist.";
    			t13 = space();
    			p5 = element("p");
    			p5.innerHTML = `In a super-wacky way, you have taken out all the names of other value system&#39;s virtues, replaced them with underscores, and are now sitting in a TGI Fridays wondering how best to <i>rock your parent&#39;s comic world</i> before the appetizers are served.`;
    			t17 = space();
    			p6 = element("p");
    			p6.textContent = "Unless you are a confused consequentialist who just thinks lying consistently produces good outcomes, you are a sort of a dark-link version of everyone else. If you are a virtue ethicist, you just think being a liar is a good state; if you are a deontologist, you probably are in some loki-based religion or something.";
    			t19 = space();
    			p7 = element("p");
    			p7.textContent = "Your funny coded category name is MALI HOOBS.";
    			t21 = space();
    			create_component(exits.$$.fragment);
    			t22 = space();
    			a = element("a");
    			a.textContent = "I want to hear your post-writing-this thoughts! Back to the blog!";
    			attr(a, "href", "https://residentcontrarian.com");
    		},
    		m(target, anchor) {
    			insert(target, h20, anchor);
    			insert(target, t0, anchor);
    			insert(target, p0, anchor);
    			insert(target, t2, anchor);
    			insert(target, p1, anchor);
    			insert(target, t4, anchor);
    			insert(target, p2, anchor);
    			insert(target, t6, anchor);
    			insert(target, p3, anchor);
    			append(p3, t7);
    			mount_component(link, p3, null);
    			append(p3, t8);
    			insert(target, t9, anchor);
    			insert(target, p4, anchor);
    			insert(target, t11, anchor);
    			insert(target, h21, anchor);
    			insert(target, t13, anchor);
    			insert(target, p5, anchor);
    			insert(target, t17, anchor);
    			insert(target, p6, anchor);
    			insert(target, t19, anchor);
    			insert(target, p7, anchor);
    			insert(target, t21, anchor);
    			mount_component(exits, target, anchor);
    			insert(target, t22, anchor);
    			insert(target, a, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const link_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link_changes.$$scope = { dirty, ctx };
    			}

    			link.$set(link_changes);
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link.$$.fragment, local);
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link.$$.fragment, local);
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h20);
    			if (detaching) detach(t0);
    			if (detaching) detach(p0);
    			if (detaching) detach(t2);
    			if (detaching) detach(p1);
    			if (detaching) detach(t4);
    			if (detaching) detach(p2);
    			if (detaching) detach(t6);
    			if (detaching) detach(p3);
    			destroy_component(link);
    			if (detaching) detach(t9);
    			if (detaching) detach(p4);
    			if (detaching) detach(t11);
    			if (detaching) detach(h21);
    			if (detaching) detach(t13);
    			if (detaching) detach(p5);
    			if (detaching) detach(t17);
    			if (detaching) detach(p6);
    			if (detaching) detach(t19);
    			if (detaching) detach(p7);
    			if (detaching) detach(t21);
    			destroy_component(exits, detaching);
    			if (detaching) detach(t22);
    			if (detaching) detach(a);
    		}
    	};
    }

    function instance$I($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Antide extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$I, create_fragment$I, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$Antide$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Antide
    });

    /* adventure\helpers\Save.svelte generated by Svelte v3.47.0 */

    function add_css$4(target) {
    	append_styles(target, "svelte-lg64zj", "span.svelte-lg64zj{display:flex;flex-direction:column;align-items:center}");
    }

    function get_each_context$2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[9] = list[i].page;
    	child_ctx[2] = list[i].state;
    	child_ctx[11] = i;
    	return child_ctx;
    }

    // (40:1) {#if current_saves.length < 3}
    function create_if_block_2(ctx) {
    	let link;
    	let current;

    	link = new /*Link*/ ctx[0]({
    			props: {
    				state: /*get_state_with_new_save*/ ctx[6](/*$current_page_name*/ ctx[5], /*$state*/ ctx[4]),
    				$$slots: { default: [create_default_slot_1$G] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link_changes = {};
    			if (dirty & /*$current_page_name, $state*/ 48) link_changes.state = /*get_state_with_new_save*/ ctx[6](/*$current_page_name*/ ctx[5], /*$state*/ ctx[4]);

    			if (dirty & /*$$scope*/ 4096) {
    				link_changes.$$scope = { dirty, ctx };
    			}

    			link.$set(link_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link, detaching);
    		}
    	};
    }

    // (41:2) <Link state={get_state_with_new_save($current_page_name, $state)}>
    function create_default_slot_1$G(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Save current status");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (47:2) {#if current_saves.length > 0}
    function create_if_block$3(ctx) {
    	let t0;
    	let t1;
    	let current;
    	let each_value = /*current_saves*/ ctx[3];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$2(get_each_context$2(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	return {
    		c() {
    			t0 = text("(");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t1 = text(")");
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, t1, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (dirty & /*current_saves, get_restore_state*/ 136) {
    				each_value = /*current_saves*/ ctx[3];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$2(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block$2(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(t1.parentNode, t1);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(t0);
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach(t1);
    		}
    	};
    }

    // (49:4) <Link to={page} state={get_restore_state(state)}>
    function create_default_slot$G(ctx) {
    	let t0;
    	let t1_value = /*i*/ ctx[11] + 1 + "";
    	let t1;

    	return {
    		c() {
    			t0 = text("Load save ");
    			t1 = text(t1_value);
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, t1, anchor);
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(t0);
    			if (detaching) detach(t1);
    		}
    	};
    }

    // (49:77) {#if i < current_saves.length - 1}
    function create_if_block_1$3(ctx) {
    	let t;

    	return {
    		c() {
    			t = text(", ");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (48:4) {#each current_saves as {page, state}
    function create_each_block$2(ctx) {
    	let link;
    	let if_block_anchor;
    	let current;

    	link = new /*Link*/ ctx[0]({
    			props: {
    				to: /*page*/ ctx[9],
    				state: /*get_restore_state*/ ctx[7](/*state*/ ctx[2]),
    				$$slots: { default: [create_default_slot$G] },
    				$$scope: { ctx }
    			}
    		});

    	let if_block = /*i*/ ctx[11] < /*current_saves*/ ctx[3].length - 1 && create_if_block_1$3();

    	return {
    		c() {
    			create_component(link.$$.fragment);
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			mount_component(link, target, anchor);
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link_changes = {};
    			if (dirty & /*current_saves*/ 8) link_changes.to = /*page*/ ctx[9];
    			if (dirty & /*current_saves*/ 8) link_changes.state = /*get_restore_state*/ ctx[7](/*state*/ ctx[2]);

    			if (dirty & /*$$scope*/ 4096) {
    				link_changes.$$scope = { dirty, ctx };
    			}

    			link.$set(link_changes);

    			if (/*i*/ ctx[11] < /*current_saves*/ ctx[3].length - 1) {
    				if (if_block) ; else {
    					if_block = create_if_block_1$3();
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link, detaching);
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function create_fragment$H(ctx) {
    	let span;
    	let t;
    	let div;
    	let current;
    	let if_block0 = /*current_saves*/ ctx[3].length < 3 && create_if_block_2(ctx);
    	let if_block1 = /*current_saves*/ ctx[3].length > 0 && create_if_block$3(ctx);

    	return {
    		c() {
    			span = element("span");
    			if (if_block0) if_block0.c();
    			t = space();
    			div = element("div");
    			if (if_block1) if_block1.c();
    			set_style(div, "white-space", "normal");
    			attr(span, "class", "svelte-lg64zj");
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			if (if_block0) if_block0.m(span, null);
    			append(span, t);
    			append(span, div);
    			if (if_block1) if_block1.m(div, null);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (/*current_saves*/ ctx[3].length < 3) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty & /*current_saves*/ 8) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_2(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(span, t);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (/*current_saves*/ ctx[3].length > 0) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty & /*current_saves*/ 8) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block$3(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div, null);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(if_block1);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block0);
    			transition_out(if_block1);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    		}
    	};
    }

    function instance$H($$self, $$props, $$invalidate) {
    	let current_saves;

    	let $state,
    		$$unsubscribe_state = noop,
    		$$subscribe_state = () => ($$unsubscribe_state(), $$unsubscribe_state = subscribe(state, $$value => $$invalidate(4, $state = $$value)), state);

    	let $current_page_name,
    		$$unsubscribe_current_page_name = noop,
    		$$subscribe_current_page_name = () => ($$unsubscribe_current_page_name(), $$unsubscribe_current_page_name = subscribe(current_page_name, $$value => $$invalidate(5, $current_page_name = $$value)), current_page_name);

    	$$self.$$.on_destroy.push(() => $$unsubscribe_state());
    	$$self.$$.on_destroy.push(() => $$unsubscribe_current_page_name());
    	let { Link, state, current_page_name } = $$props;
    	$$subscribe_state();
    	$$subscribe_current_page_name();

    	const get_state_with_new_save = (current_page, current_state) => {
    		const { saves } = current_state;
    		const new_saves = [...saves, { page: current_page, state: current_state }];
    		return { ...current_state, saves: new_saves };
    	};

    	const get_restore_state = state => ({ ...state, saves: current_saves });

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$subscribe_state($$invalidate(2, state = $$props.state));
    		if ('current_page_name' in $$props) $$subscribe_current_page_name($$invalidate(1, current_page_name = $$props.current_page_name));
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*$state*/ 16) {
    			$$invalidate(3, current_saves = $state.saves);
    		}

    		if ($$self.$$.dirty & /*current_saves*/ 8) {
    			current_saves.map(({ page, state }) => ({
    				page,
    				state: { ...state, saves: current_saves }
    			}));
    		}
    	};

    	return [
    		Link,
    		current_page_name,
    		state,
    		current_saves,
    		$state,
    		$current_page_name,
    		get_state_with_new_save,
    		get_restore_state
    	];
    }

    class Save extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$H, create_fragment$H, safe_not_equal, { Link: 0, state: 2, current_page_name: 1 }, add_css$4);
    	}
    }

    var adventure$47$helpers$47$Save$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Save
    });

    var initial_state = {
    	retrieved_the_cat_eye_glasses: false,
    	sweeped_up_the_hallway: false,
    	rescued_the_freshman: false,
    	returned_the_cat_eye_glasses: false,
    	unlocked_your_locker: false,
    	locker_unlock_attempts: 0,
    	handed_in_your_english_homework: false,
    	visits_to_library: 0,
    	saves: [],
    	carrying: {
    		eyeglasses_case: false,
    		cat_eye_glasses: false,
    		bucket: false,
    		broom: false,
    		homework: false,
    		book: false,
    	},
    };

    /* adventure\Container.svelte generated by Svelte v3.47.0 */

    function add_css$3(target) {
    	append_styles(target, "svelte-1d4wmqv", ".container.svelte-1d4wmqv{min-height:100vh;display:flex;flex-direction:column;justify-content:space-between;max-width:800px;margin-left:auto;margin-right:auto;padding:16px;white-space:normal;--blue:#3939ff;--green:#00a800;--gray:#939393}.section.svelte-1d4wmqv{display:flex;flex-direction:column;gap:16px}footer.svelte-1d4wmqv{padding-top:16px;display:flex;justify-content:space-between;align-items:center}.currently_on.svelte-1d4wmqv{font-weight:700}.container.svelte-1d4wmqv p,.container.svelte-1d4wmqv button,.container.svelte-1d4wmqv a{font-size:16px}.container.svelte-1d4wmqv hr{color:var(--gray)}");
    }

    // (16:2) {:else}
    function create_else_block_1$2(ctx) {
    	let link;
    	let current;

    	link = new /*Link*/ ctx[0]({
    			props: {
    				to: "Score",
    				$$slots: { default: [create_default_slot_2$i] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link, target, anchor);
    			current = true;
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link, detaching);
    		}
    	};
    }

    // (14:2) {#if $current_page_name === `Score`}
    function create_if_block_1$2(ctx) {
    	let span;

    	return {
    		c() {
    			span = element("span");
    			span.textContent = "Score";
    			attr(span, "class", "currently_on svelte-1d4wmqv");
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (17:3) <Link to=Score>
    function create_default_slot_2$i(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Score");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (22:2) {:else}
    function create_else_block$2(ctx) {
    	let link;
    	let current;

    	link = new /*Link*/ ctx[0]({
    			props: {
    				to: "Inventory",
    				$$slots: { default: [create_default_slot_1$F] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link, target, anchor);
    			current = true;
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link, detaching);
    		}
    	};
    }

    // (20:2) {#if $current_page_name === `Inventory`}
    function create_if_block$2(ctx) {
    	let span;

    	return {
    		c() {
    			span = element("span");
    			span.textContent = "Inventory";
    			attr(span, "class", "currently_on svelte-1d4wmqv");
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (23:3) <Link to=Inventory>
    function create_default_slot_1$F(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Inventory");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (32:2) <Link to=Start state={initial_state}>
    function create_default_slot$F(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Reset");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    function create_fragment$G(ctx) {
    	let div1;
    	let div0;
    	let t0;
    	let footer;
    	let current_block_type_index;
    	let if_block0;
    	let t1;
    	let current_block_type_index_1;
    	let if_block1;
    	let t2;
    	let save;
    	let t3;
    	let link;
    	let current;
    	const default_slot_template = /*#slots*/ ctx[4].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[5], null);
    	const if_block_creators = [create_if_block_1$2, create_else_block_1$2];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*$current_page_name*/ ctx[3] === `Score`) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	const if_block_creators_1 = [create_if_block$2, create_else_block$2];
    	const if_blocks_1 = [];

    	function select_block_type_1(ctx, dirty) {
    		if (/*$current_page_name*/ ctx[3] === `Inventory`) return 0;
    		return 1;
    	}

    	current_block_type_index_1 = select_block_type_1(ctx);
    	if_block1 = if_blocks_1[current_block_type_index_1] = if_block_creators_1[current_block_type_index_1](ctx);

    	save = new Save({
    			props: {
    				Link: /*Link*/ ctx[0],
    				state: /*state*/ ctx[1],
    				current_page_name: /*current_page_name*/ ctx[2]
    			}
    		});

    	link = new /*Link*/ ctx[0]({
    			props: {
    				to: "Start",
    				state: initial_state,
    				$$slots: { default: [create_default_slot$F] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			div1 = element("div");
    			div0 = element("div");
    			if (default_slot) default_slot.c();
    			t0 = space();
    			footer = element("footer");
    			if_block0.c();
    			t1 = space();
    			if_block1.c();
    			t2 = space();
    			create_component(save.$$.fragment);
    			t3 = space();
    			create_component(link.$$.fragment);
    			attr(div0, "class", "section svelte-1d4wmqv");
    			attr(footer, "class", "svelte-1d4wmqv");
    			attr(div1, "class", "container svelte-1d4wmqv");
    		},
    		m(target, anchor) {
    			insert(target, div1, anchor);
    			append(div1, div0);

    			if (default_slot) {
    				default_slot.m(div0, null);
    			}

    			append(div1, t0);
    			append(div1, footer);
    			if_blocks[current_block_type_index].m(footer, null);
    			append(footer, t1);
    			if_blocks_1[current_block_type_index_1].m(footer, null);
    			append(footer, t2);
    			mount_component(save, footer, null);
    			append(footer, t3);
    			mount_component(link, footer, null);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 32)) {
    					update_slot_base(
    						default_slot,
    						default_slot_template,
    						ctx,
    						/*$$scope*/ ctx[5],
    						!current
    						? get_all_dirty_from_scope(/*$$scope*/ ctx[5])
    						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[5], dirty, null),
    						null
    					);
    				}
    			}

    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index !== previous_block_index) {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block0 = if_blocks[current_block_type_index];

    				if (!if_block0) {
    					if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block0.c();
    				}

    				transition_in(if_block0, 1);
    				if_block0.m(footer, t1);
    			}

    			let previous_block_index_1 = current_block_type_index_1;
    			current_block_type_index_1 = select_block_type_1(ctx);

    			if (current_block_type_index_1 !== previous_block_index_1) {
    				group_outros();

    				transition_out(if_blocks_1[previous_block_index_1], 1, 1, () => {
    					if_blocks_1[previous_block_index_1] = null;
    				});

    				check_outros();
    				if_block1 = if_blocks_1[current_block_type_index_1];

    				if (!if_block1) {
    					if_block1 = if_blocks_1[current_block_type_index_1] = if_block_creators_1[current_block_type_index_1](ctx);
    					if_block1.c();
    				}

    				transition_in(if_block1, 1);
    				if_block1.m(footer, t2);
    			}

    			const save_changes = {};
    			if (dirty & /*Link*/ 1) save_changes.Link = /*Link*/ ctx[0];
    			if (dirty & /*state*/ 2) save_changes.state = /*state*/ ctx[1];
    			if (dirty & /*current_page_name*/ 4) save_changes.current_page_name = /*current_page_name*/ ctx[2];
    			save.$set(save_changes);
    			const link_changes = {};

    			if (dirty & /*$$scope*/ 32) {
    				link_changes.$$scope = { dirty, ctx };
    			}

    			link.$set(link_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			transition_in(if_block0);
    			transition_in(if_block1);
    			transition_in(save.$$.fragment, local);
    			transition_in(link.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			transition_out(if_block0);
    			transition_out(if_block1);
    			transition_out(save.$$.fragment, local);
    			transition_out(link.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div1);
    			if (default_slot) default_slot.d(detaching);
    			if_blocks[current_block_type_index].d();
    			if_blocks_1[current_block_type_index_1].d();
    			destroy_component(save);
    			destroy_component(link);
    		}
    	};
    }

    function instance$G($$self, $$props, $$invalidate) {
    	let $current_page_name,
    		$$unsubscribe_current_page_name = noop,
    		$$subscribe_current_page_name = () => ($$unsubscribe_current_page_name(), $$unsubscribe_current_page_name = subscribe(current_page_name, $$value => $$invalidate(3, $current_page_name = $$value)), current_page_name);

    	$$self.$$.on_destroy.push(() => $$unsubscribe_current_page_name());
    	let { $$slots: slots = {}, $$scope } = $$props;
    	let { Link, state, current_page_name } = $$props;
    	$$subscribe_current_page_name();

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    		if ('current_page_name' in $$props) $$subscribe_current_page_name($$invalidate(2, current_page_name = $$props.current_page_name));
    		if ('$$scope' in $$props) $$invalidate(5, $$scope = $$props.$$scope);
    	};

    	return [Link, state, current_page_name, $current_page_name, slots, $$scope];
    }

    class Container extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$G, create_fragment$G, safe_not_equal, { Link: 0, state: 1, current_page_name: 2 }, add_css$3);
    	}
    }

    var adventure$47$Container$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Container
    });

    /* adventure\Contrack2.svelte generated by Svelte v3.47.0 */

    function create_default_slot_2$h(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Yeah!");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (19:1) <Link to=contrack3>
    function create_default_slot_1$E(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("No.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (17:0) <Exits>
    function create_default_slot$E(ctx) {
    	let link0;
    	let t;
    	let link1;
    	let current;

    	link0 = new /*Link*/ ctx[0]({
    			props: {
    				to: "virtrack",
    				$$slots: { default: [create_default_slot_2$h] },
    				$$scope: { ctx }
    			}
    		});

    	link1 = new /*Link*/ ctx[0]({
    			props: {
    				to: "contrack3",
    				$$slots: { default: [create_default_slot_1$E] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link0.$$.fragment);
    			t = space();
    			create_component(link1.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link0, target, anchor);
    			insert(target, t, anchor);
    			mount_component(link1, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link0_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link0_changes.$$scope = { dirty, ctx };
    			}

    			link0.$set(link0_changes);
    			const link1_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link1_changes.$$scope = { dirty, ctx };
    			}

    			link1.$set(link1_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link0.$$.fragment, local);
    			transition_in(link1.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link0.$$.fragment, local);
    			transition_out(link1.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link0, detaching);
    			if (detaching) detach(t);
    			destroy_component(link1, detaching);
    		}
    	};
    }

    function create_fragment$F(ctx) {
    	let h2;
    	let t0;
    	let p;
    	let t6;
    	let exits;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$E] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			h2 = element("h2");
    			t0 = space();
    			p = element("p");
    			p.innerHTML = `OK, got it. Now, do you think lying is wrong (or right) because it either <i>has a tendency to make you worse (or better!), in terms of your value as a person</i> or indicates that you <i>are worse (or better!), in terms of your value as a person, than some hypothetical perfect person who chooses not to lie?</i> That lying isn&#39;t wrong or right as such, but instead is a potentially neutral action that really, really top-notch people do or don&#39;t do?`;
    			t6 = space();
    			create_component(exits.$$.fragment);
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t0, anchor);
    			insert(target, p, anchor);
    			insert(target, t6, anchor);
    			mount_component(exits, target, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t0);
    			if (detaching) detach(p);
    			if (detaching) detach(t6);
    			destroy_component(exits, detaching);
    		}
    	};
    }

    function instance$F($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Contrack2 extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$F, create_fragment$F, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$Contrack2$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Contrack2
    });

    /* adventure\Start.svelte generated by Svelte v3.47.0 */

    function create_default_slot_1$D(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Let's go!");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (33:1) <Exits>
    function create_default_slot$D(ctx) {
    	let link;
    	let current;

    	link = new /*Link*/ ctx[0]({
    			props: {
    				to: "Absolutes",
    				$$slots: { default: [create_default_slot_1$D] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link_changes.$$scope = { dirty, ctx };
    			}

    			link.$set(link_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link, detaching);
    		}
    	};
    }

    function create_fragment$E(ctx) {
    	let h2;
    	let t1;
    	let p0;
    	let t3;
    	let p1;
    	let t5;
    	let p2;
    	let t7;
    	let p3;
    	let t9;
    	let exits;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$D] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			h2 = element("h2");
    			h2.textContent = "What is Lying?";
    			t1 = space();
    			p0 = element("p");
    			p0.textContent = "I'm interested in concepts related honesty and lies. If you are here, you probably are too, even if only a bit.";
    			t3 = space();
    			p1 = element("p");
    			p1.textContent = "This is an exercise in defining a conceptual space. I want to give people an opportunity to sort of walk through the exact thoughts they have on lying - what makes it right, what makes it wrong, when they do it - as opposed to actually telling them I think about it.";
    			t5 = space();
    			p2 = element("p");
    			p2.textContent = "I'm going to try to keep judgment from leaking through too much, but I'm sure it will some places. Feel free to mentally eat around that particular patch of mold; again, I'm trying to make a tool for defining your own views on honesty, not mine.";
    			t7 = space();
    			p3 = element("p");
    			p3.textContent = "With all that said, let's get going!";
    			t9 = space();
    			create_component(exits.$$.fragment);
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t1, anchor);
    			insert(target, p0, anchor);
    			insert(target, t3, anchor);
    			insert(target, p1, anchor);
    			insert(target, t5, anchor);
    			insert(target, p2, anchor);
    			insert(target, t7, anchor);
    			insert(target, p3, anchor);
    			insert(target, t9, anchor);
    			mount_component(exits, target, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t1);
    			if (detaching) detach(p0);
    			if (detaching) detach(t3);
    			if (detaching) detach(p1);
    			if (detaching) detach(t5);
    			if (detaching) detach(p2);
    			if (detaching) detach(t7);
    			if (detaching) detach(p3);
    			if (detaching) detach(t9);
    			destroy_component(exits, detaching);
    		}
    	};
    }

    function instance$E($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Start extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$E, create_fragment$E, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$Start$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Start,
        initial_state: initial_state
    });

    /* adventure\burn.svelte generated by Svelte v3.47.0 */

    function create_default_slot_1$C(ctx) {
    	let t0;
    	let i;

    	return {
    		c() {
    			t0 = text("Yes. I mean, look at those weak-ass utilitarians, with their \"most good for the most people\" weirdness. You know what EA stands for? Extremely annoying. I'm stronger than that. I understand. Consequences? I'll show them Consequences. I'll show them consequences like those weaklings never, ever imagined. When the fires my lies have lit rise up to consume this ruined world, I will laugh. The peals of my laughter will usher in the ");
    			i = element("i");
    			i.textContent = "barren age.";
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, i, anchor);
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(t0);
    			if (detaching) detach(i);
    		}
    	};
    }

    // (14:0) <Exits>
    function create_default_slot$C(ctx) {
    	let link;
    	let current;

    	link = new /*Link*/ ctx[0]({
    			props: {
    				to: "burnburnburn",
    				$$slots: { default: [create_default_slot_1$C] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link_changes.$$scope = { dirty, ctx };
    			}

    			link.$set(link_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link, detaching);
    		}
    	};
    }

    function create_fragment$D(ctx) {
    	let p;
    	let t1;
    	let exits;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$C] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			p = element("p");
    			p.textContent = "You are trying to make... bad consequences? Anti-Utility?";
    			t1 = space();
    			create_component(exits.$$.fragment);
    		},
    		m(target, anchor) {
    			insert(target, p, anchor);
    			insert(target, t1, anchor);
    			mount_component(exits, target, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(p);
    			if (detaching) detach(t1);
    			destroy_component(exits, detaching);
    		}
    	};
    }

    function instance$D($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Burn extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$D, create_fragment$D, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$burn$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Burn
    });

    /* adventure\burnburnburn.svelte generated by Svelte v3.47.0 */

    function create_default_slot_1$B(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("I want to try again! Back to the top!");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (22:0) <Exits>
    function create_default_slot$B(ctx) {
    	let link;
    	let current;

    	link = new /*Link*/ ctx[0]({
    			props: {
    				to: "Start",
    				$$slots: { default: [create_default_slot_1$B] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link_changes.$$scope = { dirty, ctx };
    			}

    			link.$set(link_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link, detaching);
    		}
    	};
    }

    function create_fragment$C(ctx) {
    	let h2;
    	let t1;
    	let p0;
    	let t3;
    	let p1;
    	let t7;
    	let p2;
    	let t9;
    	let p3;
    	let t11;
    	let exits;
    	let t12;
    	let a;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$B] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			h2 = element("h2");
    			h2.textContent = "You are a Kindof Crazy A-Hole.";
    			t1 = space();
    			p0 = element("p");
    			p0.textContent = "Alternate title: Negative-Outcome Maximizing Logical Consequentialist.";
    			t3 = space();
    			p1 = element("p");
    			p1.innerHTML = `When they were passing out definitions of <i>Good Consequences</i>, you said &quot;No thanks - brought my own.&quot;. You consider others something like bacteria that need to be sterilized away with dishonesty, and then put the &quot;lie&quot; in &quot;Human-Grade Lysol&quot; and get to work.`;
    			t7 = space();
    			p2 = element("p");
    			p2.textContent = "I suspect that outside of mental illness, not many people like you actually exist in a thought-out-and-intentional way. I think it's more likely in one-off situations, i.e. a lie intended to screw over one particular guy or one particular group of people. I only know of one person who superficially appears to have lied on a long timescale with the thought of \"let's kill as many people in my outgroup as possible\", and any names used in this article are very likely to be unrelated to him.";
    			t9 = space();
    			p3 = element("p");
    			p3.textContent = "Your funny coded category name is FORMERFDACTPDIRECTORMITCHZELLER.";
    			t11 = space();
    			create_component(exits.$$.fragment);
    			t12 = space();
    			a = element("a");
    			a.textContent = "I want to hear your post-writing-this thoughts! Back to the blog!";
    			attr(a, "href", "https://residentcontrarian.com");
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t1, anchor);
    			insert(target, p0, anchor);
    			insert(target, t3, anchor);
    			insert(target, p1, anchor);
    			insert(target, t7, anchor);
    			insert(target, p2, anchor);
    			insert(target, t9, anchor);
    			insert(target, p3, anchor);
    			insert(target, t11, anchor);
    			mount_component(exits, target, anchor);
    			insert(target, t12, anchor);
    			insert(target, a, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t1);
    			if (detaching) detach(p0);
    			if (detaching) detach(t3);
    			if (detaching) detach(p1);
    			if (detaching) detach(t7);
    			if (detaching) detach(p2);
    			if (detaching) detach(t9);
    			if (detaching) detach(p3);
    			if (detaching) detach(t11);
    			destroy_component(exits, detaching);
    			if (detaching) detach(t12);
    			if (detaching) detach(a);
    		}
    	};
    }

    function instance$C($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Burnburnburn extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$C, create_fragment$C, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$burnburnburn$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Burnburnburn
    });

    /* adventure\cartman.svelte generated by Svelte v3.47.0 */

    function create_default_slot_1$A(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("I want to try again! Back to the top!");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (22:0) <Exits>
    function create_default_slot$A(ctx) {
    	let link;
    	let current;

    	link = new /*Link*/ ctx[0]({
    			props: {
    				to: "Start",
    				$$slots: { default: [create_default_slot_1$A] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link_changes.$$scope = { dirty, ctx };
    			}

    			link.$set(link_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link, detaching);
    		}
    	};
    }

    function create_fragment$B(ctx) {
    	let h2;
    	let t1;
    	let p0;
    	let t3;
    	let p1;
    	let t7;
    	let p2;
    	let t9;
    	let p3;
    	let t11;
    	let exits;
    	let t12;
    	let a;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$A] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			h2 = element("h2");
    			h2.textContent = "You are a Do-What-I-Want Chaos-Monster.";
    			t1 = space();
    			p0 = element("p");
    			p0.textContent = "Well, kind of. Chaos-Monster is a little strong, and a little inaccurate.";
    			t3 = space();
    			p1 = element("p");
    			p1.innerHTML = `The deal here is that you are mostly not concerned with lying or not lying so much as you are with making sure things turn out well for you. And I want to be really honest here: There&#39;s probably more people in your group than any of the others in this whole survey. I don&#39;t think it&#39;s <i>great</i>; neither do you when I put it in these terms. But at the same time, there&#39;s an awful lot of people in this group; it takes active work to get out of this category, and like most things that take active, extra effort most people don&#39;t end up actually doing it.`;
    			t7 = space();
    			p2 = element("p");
    			p2.textContent = "What sets you apart (and makes you a little better) is that you actually are (presumably) honest about it. All the other groups - deontologists, consequentialists, virtue ethics folks - have plenty of people who have adopted a moral system only in the sense that it's their favorite one. It doesn't drive action for them. It doesn't necessarily drive action for you, either, but at least you aren't a hypocrite about it.";
    			t9 = space();
    			p3 = element("p");
    			p3.textContent = "Your funny coded category name is CARTMAN.";
    			t11 = space();
    			create_component(exits.$$.fragment);
    			t12 = space();
    			a = element("a");
    			a.textContent = "I want to hear your post-writing-this thoughts! Back to the blog!";
    			attr(a, "href", "https://residentcontrarian.com");
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t1, anchor);
    			insert(target, p0, anchor);
    			insert(target, t3, anchor);
    			insert(target, p1, anchor);
    			insert(target, t7, anchor);
    			insert(target, p2, anchor);
    			insert(target, t9, anchor);
    			insert(target, p3, anchor);
    			insert(target, t11, anchor);
    			mount_component(exits, target, anchor);
    			insert(target, t12, anchor);
    			insert(target, a, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t1);
    			if (detaching) detach(p0);
    			if (detaching) detach(t3);
    			if (detaching) detach(p1);
    			if (detaching) detach(t7);
    			if (detaching) detach(p2);
    			if (detaching) detach(t9);
    			if (detaching) detach(p3);
    			if (detaching) detach(t11);
    			destroy_component(exits, detaching);
    			if (detaching) detach(t12);
    			if (detaching) detach(a);
    		}
    	};
    }

    function instance$B($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Cartman extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$B, create_fragment$B, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$cartman$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Cartman
    });

    /* adventure\conpsychic.svelte generated by Svelte v3.47.0 */

    function create_default_slot_2$g(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Of course I don't - I think it's wrong to not maximize utility, we've covered this.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (24:1) <Link to=knowledgerespect>
    function create_default_slot_1$z(ctx) {
    	let t0;
    	let i;
    	let t2;

    	return {
    		c() {
    			t0 = text("Of course I don't - you can't ");
    			i = element("i");
    			i.textContent = "completely";
    			t2 = text(" disregard the desires of others.");
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, i, anchor);
    			insert(target, t2, anchor);
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(t0);
    			if (detaching) detach(i);
    			if (detaching) detach(t2);
    		}
    	};
    }

    // (22:0) <Exits>
    function create_default_slot$z(ctx) {
    	let link0;
    	let t;
    	let link1;
    	let current;

    	link0 = new /*Link*/ ctx[0]({
    			props: {
    				to: "knowledgedisregard",
    				$$slots: { default: [create_default_slot_2$g] },
    				$$scope: { ctx }
    			}
    		});

    	link1 = new /*Link*/ ctx[0]({
    			props: {
    				to: "knowledgerespect",
    				$$slots: { default: [create_default_slot_1$z] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link0.$$.fragment);
    			t = space();
    			create_component(link1.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link0, target, anchor);
    			insert(target, t, anchor);
    			mount_component(link1, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link0_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link0_changes.$$scope = { dirty, ctx };
    			}

    			link0.$set(link0_changes);
    			const link1_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link1_changes.$$scope = { dirty, ctx };
    			}

    			link1.$set(link1_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link0.$$.fragment, local);
    			transition_in(link1.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link0.$$.fragment, local);
    			transition_out(link1.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link0, detaching);
    			if (detaching) detach(t);
    			destroy_component(link1, detaching);
    		}
    	};
    }

    function create_fragment$A(ctx) {
    	let p0;
    	let t1;
    	let p1;
    	let t3;
    	let p2;
    	let t5;
    	let p3;
    	let t7;
    	let p4;
    	let t8;
    	let exits;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$z] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			p0 = element("p");
    			p0.textContent = "You are a mentat or in some way gifted with prescience, and can thus pretty well predict what's going to happen in the future as a consequence of your lie. Because you are also a consequentialist, this means you know the moral implications of every lie to a high level of fidelity.";
    			t1 = space();
    			p1 = element("p");
    			p1.textContent = "That seems like it should be it, since we've covered that you don't think lying is intrinsically right, that you don't just lie because you feel like it; all that's really left is lying because some level of net utility convinces you it's worth it.";
    			t3 = space();
    			p2 = element("p");
    			p2.textContent = "Here's one last wrinkle, though. Say James has once again given you call to maybe-lie by asking why people don't like him. In your omniscience, you have determined that him knowing that it's because he doesn't bath would be net-negative to him. You don't think that it would hurt anyone else if he knew, and you yourself don't mind telling him besides the net-negative thing.";
    			t5 = space();
    			p3 = element("p");
    			p3.textContent = "James himself has been very, very clear in the past that his preference is to always hear the truth if at all possible; you know to a reasonable level of certainty he'd actually be mad later if he found out you lied to him. In this scenario, do you respect James' preference, or do you opt to do what you think will maximize his utility?";
    			t7 = space();
    			p4 = element("p");
    			t8 = space();
    			create_component(exits.$$.fragment);
    		},
    		m(target, anchor) {
    			insert(target, p0, anchor);
    			insert(target, t1, anchor);
    			insert(target, p1, anchor);
    			insert(target, t3, anchor);
    			insert(target, p2, anchor);
    			insert(target, t5, anchor);
    			insert(target, p3, anchor);
    			insert(target, t7, anchor);
    			insert(target, p4, anchor);
    			insert(target, t8, anchor);
    			mount_component(exits, target, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(p0);
    			if (detaching) detach(t1);
    			if (detaching) detach(p1);
    			if (detaching) detach(t3);
    			if (detaching) detach(p2);
    			if (detaching) detach(t5);
    			if (detaching) detach(p3);
    			if (detaching) detach(t7);
    			if (detaching) detach(p4);
    			if (detaching) detach(t8);
    			destroy_component(exits, detaching);
    		}
    	};
    }

    function instance$A($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Conpsychic extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$A, create_fragment$A, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$conpsychic$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Conpsychic
    });

    /* adventure\contrack.svelte generated by Svelte v3.47.0 */

    function create_default_slot_2$f(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("What? No, of course not.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (16:1) <Link to=Antide>
    function create_default_slot_1$y(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Yes.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (14:0) <Exits>
    function create_default_slot$y(ctx) {
    	let link0;
    	let t;
    	let link1;
    	let current;

    	link0 = new /*Link*/ ctx[0]({
    			props: {
    				to: "Contrack2",
    				$$slots: { default: [create_default_slot_2$f] },
    				$$scope: { ctx }
    			}
    		});

    	link1 = new /*Link*/ ctx[0]({
    			props: {
    				to: "Antide",
    				$$slots: { default: [create_default_slot_1$y] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link0.$$.fragment);
    			t = space();
    			create_component(link1.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link0, target, anchor);
    			insert(target, t, anchor);
    			mount_component(link1, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link0_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link0_changes.$$scope = { dirty, ctx };
    			}

    			link0.$set(link0_changes);
    			const link1_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link1_changes.$$scope = { dirty, ctx };
    			}

    			link1.$set(link1_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link0.$$.fragment, local);
    			transition_in(link1.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link0.$$.fragment, local);
    			transition_out(link1.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link0, detaching);
    			if (detaching) detach(t);
    			destroy_component(link1, detaching);
    		}
    	};
    }

    function create_fragment$z(ctx) {
    	let p;
    	let t1;
    	let exits;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$y] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			p = element("p");
    			p.textContent = "OK, you've reached what will be, for most people, the consequentialist track of this thing. But before we can assume that 100%, we need to eliminate some outliers. Believe me that it's much easier to do this now than later. So, first: Do you think lying is inherently right? We already ruled out the idea that lying is intrinsically wrong in a self-contained-morality-of-act way; do you think the opposite is true, and that lying is always right? That the rightness of lying is baked into lying itself?";
    			t1 = space();
    			create_component(exits.$$.fragment);
    		},
    		m(target, anchor) {
    			insert(target, p, anchor);
    			insert(target, t1, anchor);
    			mount_component(exits, target, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(p);
    			if (detaching) detach(t1);
    			destroy_component(exits, detaching);
    		}
    	};
    }

    function instance$z($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Contrack extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$z, create_fragment$z, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$contrack$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Contrack
    });

    /* adventure\contrack3.svelte generated by Svelte v3.47.0 */

    function create_default_slot_2$e(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("No; I either don't consider my own wants at all or don't treat them as my primary decision criteria when lying.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (21:1) <Link to=cartman>
    function create_default_slot_1$x(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Yes; if you looked at a spreadsheet of my lies, the majority of them would line up exactly with what I wanted to do anyway.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (19:0) <Exits>
    function create_default_slot$x(ctx) {
    	let link0;
    	let t;
    	let link1;
    	let current;

    	link0 = new /*Link*/ ctx[0]({
    			props: {
    				to: "contrack4",
    				$$slots: { default: [create_default_slot_2$e] },
    				$$scope: { ctx }
    			}
    		});

    	link1 = new /*Link*/ ctx[0]({
    			props: {
    				to: "cartman",
    				$$slots: { default: [create_default_slot_1$x] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link0.$$.fragment);
    			t = space();
    			create_component(link1.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link0, target, anchor);
    			insert(target, t, anchor);
    			mount_component(link1, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link0_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link0_changes.$$scope = { dirty, ctx };
    			}

    			link0.$set(link0_changes);
    			const link1_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link1_changes.$$scope = { dirty, ctx };
    			}

    			link1.$set(link1_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link0.$$.fragment, local);
    			transition_in(link1.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link0.$$.fragment, local);
    			transition_out(link1.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link0, detaching);
    			if (detaching) detach(t);
    			destroy_component(link1, detaching);
    		}
    	};
    }

    function create_fragment$y(ctx) {
    	let p0;
    	let t1;
    	let p1;
    	let t3;
    	let p2;
    	let t5;
    	let exits;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$x] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			p0 = element("p");
    			p0.textContent = "We are now mostly on the consequentialist track, but there's just a little more weirdness to sort through:";
    			t1 = space();
    			p1 = element("p");
    			p1.textContent = "Do you privilege yourself and your desires/benefit above others when choosing to lie or not lie? Now, I don't mean just a bit - I think everyone probably does just a bit. I'm talking more about a very significant bias towards yourself that shows itself whenever you choose to lie. So if James-The-Unwashed-Killer-of-Vibe was asking you why he didn't get invited to the party, you might or might not privileged yourself (in avoiding the awkwardness of telling him, or in telling him and getting to bask in his sorrow) over things like the greater, society-wide consequences.";
    			t3 = space();
    			p2 = element("p");
    			p2.textContent = "Again, everyone does this kind of stuff a little; it's very, very hard not to. I'm more asking if it's the primary driver of the decision in a way that usually predicts your eventual action.";
    			t5 = space();
    			create_component(exits.$$.fragment);
    		},
    		m(target, anchor) {
    			insert(target, p0, anchor);
    			insert(target, t1, anchor);
    			insert(target, p1, anchor);
    			insert(target, t3, anchor);
    			insert(target, p2, anchor);
    			insert(target, t5, anchor);
    			mount_component(exits, target, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(p0);
    			if (detaching) detach(t1);
    			if (detaching) detach(p1);
    			if (detaching) detach(t3);
    			if (detaching) detach(p2);
    			if (detaching) detach(t5);
    			destroy_component(exits, detaching);
    		}
    	};
    }

    function instance$y($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Contrack3 extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$y, create_fragment$y, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$contrack3$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Contrack3
    });

    /* adventure\contrack4.svelte generated by Svelte v3.47.0 */

    function create_default_slot_2$d(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Pretty much, yes.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (23:1) <Link to=conuncertain>
    function create_default_slot_1$w(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("No, I can't.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (21:0) <Exits>
    function create_default_slot$w(ctx) {
    	let link0;
    	let t;
    	let link1;
    	let current;

    	link0 = new /*Link*/ ctx[0]({
    			props: {
    				to: "conpsychic",
    				$$slots: { default: [create_default_slot_2$d] },
    				$$scope: { ctx }
    			}
    		});

    	link1 = new /*Link*/ ctx[0]({
    			props: {
    				to: "conuncertain",
    				$$slots: { default: [create_default_slot_1$w] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link0.$$.fragment);
    			t = space();
    			create_component(link1.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link0, target, anchor);
    			insert(target, t, anchor);
    			mount_component(link1, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link0_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link0_changes.$$scope = { dirty, ctx };
    			}

    			link0.$set(link0_changes);
    			const link1_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link1_changes.$$scope = { dirty, ctx };
    			}

    			link1.$set(link1_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link0.$$.fragment, local);
    			transition_in(link1.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link0.$$.fragment, local);
    			transition_out(link1.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link0, detaching);
    			if (detaching) detach(t);
    			destroy_component(link1, detaching);
    		}
    	};
    }

    function create_fragment$x(ctx) {
    	let h2;
    	let t0;
    	let p0;
    	let t2;
    	let p1;
    	let t4;
    	let p2;
    	let t6;
    	let exits;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$w] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			h2 = element("h2");
    			t0 = space();
    			p0 = element("p");
    			p0.textContent = "OK, thanks for bearing with me. We are now properly and fully on the consequentialist track.";
    			t2 = space();
    			p1 = element("p");
    			p1.textContent = "You've indicated that you don't think lies are bad because lies themselves are inherently bad, which pretty much knocks out all forms of deontology. You've also indicated that you don't think that lies are bad because of the kind of person they imply you are or make you into, which mostly knocks out virtue ethics. In terms of big, comprehensible moral structures, that pretty much leaves us with consequentialism. Which is tough on me, because there's far more branches to consequentialism than any other way we could go here.";
    			t4 = space();
    			p2 = element("p");
    			p2.textContent = "So first: Consequentialism thinks that actions are wrong or right based on their consequences. Can you, through some kind of predictive power, know what the future consequences of any given action are 100% of the the time, or close to it?";
    			t6 = space();
    			create_component(exits.$$.fragment);
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t0, anchor);
    			insert(target, p0, anchor);
    			insert(target, t2, anchor);
    			insert(target, p1, anchor);
    			insert(target, t4, anchor);
    			insert(target, p2, anchor);
    			insert(target, t6, anchor);
    			mount_component(exits, target, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t0);
    			if (detaching) detach(p0);
    			if (detaching) detach(t2);
    			if (detaching) detach(p1);
    			if (detaching) detach(t4);
    			if (detaching) detach(p2);
    			if (detaching) detach(t6);
    			destroy_component(exits, detaching);
    		}
    	};
    }

    function instance$x($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Contrack4 extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$x, create_fragment$x, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$contrack4$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Contrack4
    });

    /* adventure\conuncertain.svelte generated by Svelte v3.47.0 */

    function create_default_slot_2$c(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("No, I only lie when I'm pretty damn sure it's going to cause some good.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (19:1) <Link to=uncertainlie>
    function create_default_slot_1$v(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("This is still a net positive for our great city. I'm lying here.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (17:0) <Exits>
    function create_default_slot$v(ctx) {
    	let link0;
    	let t;
    	let link1;
    	let current;

    	link0 = new /*Link*/ ctx[0]({
    			props: {
    				to: "nouncertainlie",
    				$$slots: { default: [create_default_slot_2$c] },
    				$$scope: { ctx }
    			}
    		});

    	link1 = new /*Link*/ ctx[0]({
    			props: {
    				to: "uncertainlie",
    				$$slots: { default: [create_default_slot_1$v] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link0.$$.fragment);
    			t = space();
    			create_component(link1.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link0, target, anchor);
    			insert(target, t, anchor);
    			mount_component(link1, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link0_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link0_changes.$$scope = { dirty, ctx };
    			}

    			link0.$set(link0_changes);
    			const link1_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link1_changes.$$scope = { dirty, ctx };
    			}

    			link1.$set(link1_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link0.$$.fragment, local);
    			transition_in(link1.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link0.$$.fragment, local);
    			transition_out(link1.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link0, detaching);
    			if (detaching) detach(t);
    			destroy_component(link1, detaching);
    		}
    	};
    }

    function create_fragment$w(ctx) {
    	let p0;
    	let t3;
    	let p1;
    	let t5;
    	let exits;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$v] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			p0 = element("p");
    			p0.innerHTML = `To be very clear, you&#39;ve chosen wisely here. The guys who are claiming they know the outcomes in advance? They aren&#39;t even full of shit. They are just clicking that link to see how I handle it. I&#39;m going to reward you by saving you time and just telling you: I handled it <i>poorly.</i> Turns out this choose-your-own-adventure stuff is a lot of work.`;
    			t3 = space();
    			p1 = element("p");
    			p1.textContent = "OK, so, given that you aren't sure of the consequences, does that uncertainty stop you from lying? Like, say you've got less than 75% certainty the lie is going to be net-good. Do you still lie?";
    			t5 = space();
    			create_component(exits.$$.fragment);
    		},
    		m(target, anchor) {
    			insert(target, p0, anchor);
    			insert(target, t3, anchor);
    			insert(target, p1, anchor);
    			insert(target, t5, anchor);
    			mount_component(exits, target, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(p0);
    			if (detaching) detach(t3);
    			if (detaching) detach(p1);
    			if (detaching) detach(t5);
    			destroy_component(exits, detaching);
    		}
    	};
    }

    function instance$w($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Conuncertain extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$w, create_fragment$w, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$conuncertain$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Conuncertain
    });

    /* adventure\detrack.svelte generated by Svelte v3.47.0 */

    function create_default_slot_2$b(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Yes.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (28:1) <Link to=detrackwhynot>
    function create_default_slot_1$u(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Well, no, not then, obviously.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (26:0) <Exits>
    function create_default_slot$u(ctx) {
    	let link0;
    	let t;
    	let link1;
    	let current;

    	link0 = new /*Link*/ ctx[0]({
    			props: {
    				to: "detrackwhat",
    				$$slots: { default: [create_default_slot_2$b] },
    				$$scope: { ctx }
    			}
    		});

    	link1 = new /*Link*/ ctx[0]({
    			props: {
    				to: "detrackwhynot",
    				$$slots: { default: [create_default_slot_1$u] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link0.$$.fragment);
    			t = space();
    			create_component(link1.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link0, target, anchor);
    			insert(target, t, anchor);
    			mount_component(link1, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link0_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link0_changes.$$scope = { dirty, ctx };
    			}

    			link0.$set(link0_changes);
    			const link1_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link1_changes.$$scope = { dirty, ctx };
    			}

    			link1.$set(link1_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link0.$$.fragment, local);
    			transition_in(link1.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link0.$$.fragment, local);
    			transition_out(link1.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link0, detaching);
    			if (detaching) detach(t);
    			destroy_component(link1, detaching);
    		}
    	};
    }

    function create_fragment$v(ctx) {
    	let h2;
    	let t0;
    	let p0;
    	let t2;
    	let p1;
    	let t4;
    	let p2;
    	let t6;
    	let p3;
    	let t7;
    	let p4;
    	let t8;
    	let exits;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$u] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			h2 = element("h2");
    			t0 = space();
    			p0 = element("p");
    			p0.textContent = "So the belief that lying is abstractly wrong - wrong at an act-level, as opposed to wrong at a consequences-level, is a pretty strong stance. Is that stance conditional?";
    			t2 = space();
    			p1 = element("p");
    			p1.textContent = "Like, assume (as we often must) a Nazi Germany situation. You know the location of a Jewish family, and a Nazi asks you where they are so he can go round them up and ship them to near-certain doom. If you tell the complete truth, they die; if you lie about where they've gone, he won't find them and will just assume they got away. If you truthfully say you know where they are but refuse to tell, they will torture the information out of you and then kill you. Is it still wrong to lie?";
    			t4 = space();
    			p2 = element("p");
    			p2.textContent = "Note that what I'm trying to get at here is the situation that justifies lying the most. If you can think of one that does that better, sub it in. You have full permission to create scenarios where not lying immediately causes the heat death of the universe or whatever floats your boat here.";
    			t6 = space();
    			p3 = element("p");
    			t7 = space();
    			p4 = element("p");
    			t8 = space();
    			create_component(exits.$$.fragment);
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t0, anchor);
    			insert(target, p0, anchor);
    			insert(target, t2, anchor);
    			insert(target, p1, anchor);
    			insert(target, t4, anchor);
    			insert(target, p2, anchor);
    			insert(target, t6, anchor);
    			insert(target, p3, anchor);
    			insert(target, t7, anchor);
    			insert(target, p4, anchor);
    			insert(target, t8, anchor);
    			mount_component(exits, target, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t0);
    			if (detaching) detach(p0);
    			if (detaching) detach(t2);
    			if (detaching) detach(p1);
    			if (detaching) detach(t4);
    			if (detaching) detach(p2);
    			if (detaching) detach(t6);
    			if (detaching) detach(p3);
    			if (detaching) detach(t7);
    			if (detaching) detach(p4);
    			if (detaching) detach(t8);
    			destroy_component(exits, detaching);
    		}
    	};
    }

    function instance$v($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Detrack extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$v, create_fragment$v, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$detrack$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Detrack
    });

    /* adventure\detracklifelimb.svelte generated by Svelte v3.47.0 */

    function create_default_slot_1$t(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("I want to try again! Back to the top!");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (20:0) <Exits>
    function create_default_slot$t(ctx) {
    	let link;
    	let current;

    	link = new /*Link*/ ctx[0]({
    			props: {
    				to: "Start",
    				$$slots: { default: [create_default_slot_1$t] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link_changes.$$scope = { dirty, ctx };
    			}

    			link.$set(link_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link, detaching);
    		}
    	};
    }

    function create_fragment$u(ctx) {
    	let h2;
    	let t1;
    	let p0;
    	let t3;
    	let p1;
    	let t7;
    	let p2;
    	let t9;
    	let exits;
    	let t10;
    	let a;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$t] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			h2 = element("h2");
    			h2.textContent = "You are a Life-and-Limb Anti-Lying Conditionalist.";
    			t1 = space();
    			p0 = element("p");
    			p0.textContent = "You basically think lying is absolutely wrong, except you have some semantics-based exceptions for what \"lying\" is. Luckily, it's only one exception, and it mostly makes sense that you'd choose the one you did. This is a pretty easy way to resolve the whole \"I'd lie, and lying is bad, but this isn't somehow\" paradox. If someone would be seriously endangered by you not lying, you do it. The last metroid is in captivity. The galaxy is at peace.";
    			t3 = space();
    			p1 = element("p");
    			p1.innerHTML = `This doesn&#39;t really tell us anything about whether or not you lie in <i>practice,</i> though. In some other branches we dig into that a little more, but here we will just note that perceptions of morality don&#39;t always align with moral practice and leave it at that.`;
    			t7 = space();
    			p2 = element("p");
    			p2.textContent = "Your funny coded category name is LILIANCO.";
    			t9 = space();
    			create_component(exits.$$.fragment);
    			t10 = space();
    			a = element("a");
    			a.textContent = "I want to hear your post-writing-this thoughts! Back to the blog!";
    			attr(a, "href", "https://residentcontrarian.com");
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t1, anchor);
    			insert(target, p0, anchor);
    			insert(target, t3, anchor);
    			insert(target, p1, anchor);
    			insert(target, t7, anchor);
    			insert(target, p2, anchor);
    			insert(target, t9, anchor);
    			mount_component(exits, target, anchor);
    			insert(target, t10, anchor);
    			insert(target, a, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t1);
    			if (detaching) detach(p0);
    			if (detaching) detach(t3);
    			if (detaching) detach(p1);
    			if (detaching) detach(t7);
    			if (detaching) detach(p2);
    			if (detaching) detach(t9);
    			destroy_component(exits, detaching);
    			if (detaching) detach(t10);
    			if (detaching) detach(a);
    		}
    	};
    }

    function instance$u($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Detracklifelimb extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$u, create_fragment$u, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$detracklifelimb$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Detracklifelimb
    });

    /* adventure\detrackmitigate.svelte generated by Svelte v3.47.0 */

    function create_default_slot_3$4(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Yes, that's what I meant. I don't think there are any other exceptions.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (23:1) <Link to=detrackmuddle>
    function create_default_slot_2$a(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Yes, that's about what I mean, but I can think of other exceptions that make lies into not-lies.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (24:1) <Link to=detrackwhynot>
    function create_default_slot_1$s(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("This isn't what I meant. Take me back a page.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (21:0) <Exits>
    function create_default_slot$s(ctx) {
    	let link0;
    	let t0;
    	let link1;
    	let t1;
    	let link2;
    	let current;

    	link0 = new /*Link*/ ctx[0]({
    			props: {
    				to: "detracklifelimb",
    				$$slots: { default: [create_default_slot_3$4] },
    				$$scope: { ctx }
    			}
    		});

    	link1 = new /*Link*/ ctx[0]({
    			props: {
    				to: "detrackmuddle",
    				$$slots: { default: [create_default_slot_2$a] },
    				$$scope: { ctx }
    			}
    		});

    	link2 = new /*Link*/ ctx[0]({
    			props: {
    				to: "detrackwhynot",
    				$$slots: { default: [create_default_slot_1$s] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link0.$$.fragment);
    			t0 = space();
    			create_component(link1.$$.fragment);
    			t1 = space();
    			create_component(link2.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link0, target, anchor);
    			insert(target, t0, anchor);
    			mount_component(link1, target, anchor);
    			insert(target, t1, anchor);
    			mount_component(link2, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link0_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link0_changes.$$scope = { dirty, ctx };
    			}

    			link0.$set(link0_changes);
    			const link1_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link1_changes.$$scope = { dirty, ctx };
    			}

    			link1.$set(link1_changes);
    			const link2_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link2_changes.$$scope = { dirty, ctx };
    			}

    			link2.$set(link2_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link0.$$.fragment, local);
    			transition_in(link1.$$.fragment, local);
    			transition_in(link2.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link0.$$.fragment, local);
    			transition_out(link1.$$.fragment, local);
    			transition_out(link2.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link0, detaching);
    			if (detaching) detach(t0);
    			destroy_component(link1, detaching);
    			if (detaching) detach(t1);
    			destroy_component(link2, detaching);
    		}
    	};
    }

    function create_fragment$t(ctx) {
    	let p0;
    	let t1;
    	let p1;
    	let t5;
    	let p2;
    	let t7;
    	let p3;
    	let t9;
    	let ol;
    	let t12;
    	let exits;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$s] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			p0 = element("p");
    			p0.textContent = "So, if you got here, you are very likely working up to saying a particular thing related to the definition of the word \"lie\" itself. If what I say after this doesn't track with what you were thinking, go back and try an different option; I should have most of them covered in one way or another.";
    			t1 = space();
    			p1 = element("p");
    			p1.innerHTML = `The way I understand this stance is something like this: We don&#39;t usually consider someone who kills someone else in self-defense to be a murderer. It&#39;s <i>killing,</i> yes, but not murder; the situation is different enough that we need a different word to cover them. And usually the same is true of things like, say, killing a mass-murdering Nazi in defense of innocents, or stuff like that.`;
    			t5 = space();
    			p2 = element("p");
    			p2.textContent = "If it applies to killing, it should probably apply to things like lying, too; if anything it's a lower-impact way to get the whole \"save a life\" thing done. Since it's not quite the same thing, it opens up the possibility of saying \"lying is always a sin, but this isn't lying really; we just don't have a good term for lying in self-defense\".";
    			t7 = space();
    			p3 = element("p");
    			p3.textContent = "Two questions for you:";
    			t9 = space();
    			ol = element("ol");
    			ol.innerHTML = `<li>Is that close to what you were thinking?</li><li>Is this true just with situations we&#39;d normally think of as self-defense, or other things as well?</li>`;
    			t12 = space();
    			create_component(exits.$$.fragment);
    		},
    		m(target, anchor) {
    			insert(target, p0, anchor);
    			insert(target, t1, anchor);
    			insert(target, p1, anchor);
    			insert(target, t5, anchor);
    			insert(target, p2, anchor);
    			insert(target, t7, anchor);
    			insert(target, p3, anchor);
    			insert(target, t9, anchor);
    			insert(target, ol, anchor);
    			insert(target, t12, anchor);
    			mount_component(exits, target, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(p0);
    			if (detaching) detach(t1);
    			if (detaching) detach(p1);
    			if (detaching) detach(t5);
    			if (detaching) detach(p2);
    			if (detaching) detach(t7);
    			if (detaching) detach(p3);
    			if (detaching) detach(t9);
    			if (detaching) detach(ol);
    			if (detaching) detach(t12);
    			destroy_component(exits, detaching);
    		}
    	};
    }

    function instance$t($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Detrackmitigate extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$t, create_fragment$t, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$detrackmitigate$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Detrackmitigate
    });

    /* adventure\detrackmuddle.svelte generated by Svelte v3.47.0 */

    function create_default_slot_1$r(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("I want to try again! Back to the top!");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (21:0) <Exits>
    function create_default_slot$r(ctx) {
    	let link;
    	let current;

    	link = new /*Link*/ ctx[0]({
    			props: {
    				to: "Start",
    				$$slots: { default: [create_default_slot_1$r] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link_changes.$$scope = { dirty, ctx };
    			}

    			link.$set(link_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link, detaching);
    		}
    	};
    }

    function create_fragment$s(ctx) {
    	let h2;
    	let t1;
    	let p0;
    	let t3;
    	let p1;
    	let t5;
    	let p2;
    	let t7;
    	let exits;
    	let t8;
    	let a;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$r] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			h2 = element("h2");
    			h2.textContent = "Ugh. You are a complex thing that has a big enough range I'm not going to try to name it or dig any deeper.";
    			t1 = space();
    			p0 = element("p");
    			p0.textContent = "So despite the \"Ugh\", I'm not judging you. It's just that doing your category justice involves a lot of work I don't want to do. The thing about you is that depending on how many exceptions you have, you range from something like \"A person who thinks lying isn't wrong when it saves a life, and perhaps a few other similarly serious situations\" to \"Confused consequentialist\".";
    			t3 = space();
    			p1 = element("p");
    			p1.textContent = "Figuring out what you are exactly would take time. Time we don't have. And it wouldn't really be worth it because basically all we are doing is counting the number of exceptions to the rule here. Again, it's not that this is especially bad in any way, it's just that I have to write a bunch of these entries and get this published before people start complaining about me being inconsistent again.";
    			t5 = space();
    			p2 = element("p");
    			p2.textContent = "Your funny coded category name is MUDDLESTUMP.";
    			t7 = space();
    			create_component(exits.$$.fragment);
    			t8 = space();
    			a = element("a");
    			a.textContent = "I want to hear your post-writing-this thoughts! Back to the blog!";
    			attr(a, "href", "https://residentcontrarian.com");
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t1, anchor);
    			insert(target, p0, anchor);
    			insert(target, t3, anchor);
    			insert(target, p1, anchor);
    			insert(target, t5, anchor);
    			insert(target, p2, anchor);
    			insert(target, t7, anchor);
    			mount_component(exits, target, anchor);
    			insert(target, t8, anchor);
    			insert(target, a, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t1);
    			if (detaching) detach(p0);
    			if (detaching) detach(t3);
    			if (detaching) detach(p1);
    			if (detaching) detach(t5);
    			if (detaching) detach(p2);
    			if (detaching) detach(t7);
    			destroy_component(exits, detaching);
    			if (detaching) detach(t8);
    			if (detaching) detach(a);
    		}
    	};
    }

    function instance$s($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Detrackmuddle extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$s, create_fragment$s, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$detrackmuddle$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Detrackmuddle
    });

    /* adventure\detracknaziactuallylie.svelte generated by Svelte v3.47.0 */

    function create_default_slot_3$3(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("At some point, the consequences outweigh the rightness or wrongness of the action. In this case, people were going to die; I think my action wasn't wrong considering that.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (26:1) <Link to=scalesofgood>
    function create_default_slot_2$9(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("The action of lying is wrong, and no amount of consequences can nullify that. But lying here seems like it would break some higher-order rules; I think \"thou shalt not lie\" just got outranked here.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (27:1) <Link to=detracksometimesyousin>
    function create_default_slot_1$q(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Actually, it's neither. I think that lying is morally wrong in this case, I just couldn't face the music of living up to my moral ideals.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (24:0) <Exits>
    function create_default_slot$q(ctx) {
    	let link0;
    	let t0;
    	let link1;
    	let t1;
    	let link2;
    	let current;

    	link0 = new /*Link*/ ctx[0]({
    			props: {
    				to: "detractconfork",
    				$$slots: { default: [create_default_slot_3$3] },
    				$$scope: { ctx }
    			}
    		});

    	link1 = new /*Link*/ ctx[0]({
    			props: {
    				to: "scalesofgood",
    				$$slots: { default: [create_default_slot_2$9] },
    				$$scope: { ctx }
    			}
    		});

    	link2 = new /*Link*/ ctx[0]({
    			props: {
    				to: "detracksometimesyousin",
    				$$slots: { default: [create_default_slot_1$q] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link0.$$.fragment);
    			t0 = space();
    			create_component(link1.$$.fragment);
    			t1 = space();
    			create_component(link2.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link0, target, anchor);
    			insert(target, t0, anchor);
    			mount_component(link1, target, anchor);
    			insert(target, t1, anchor);
    			mount_component(link2, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link0_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link0_changes.$$scope = { dirty, ctx };
    			}

    			link0.$set(link0_changes);
    			const link1_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link1_changes.$$scope = { dirty, ctx };
    			}

    			link1.$set(link1_changes);
    			const link2_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link2_changes.$$scope = { dirty, ctx };
    			}

    			link2.$set(link2_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link0.$$.fragment, local);
    			transition_in(link1.$$.fragment, local);
    			transition_in(link2.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link0.$$.fragment, local);
    			transition_out(link1.$$.fragment, local);
    			transition_out(link2.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link0, detaching);
    			if (detaching) detach(t0);
    			destroy_component(link1, detaching);
    			if (detaching) detach(t1);
    			destroy_component(link2, detaching);
    		}
    	};
    }

    function create_fragment$r(ctx) {
    	let h2;
    	let t0;
    	let p0;
    	let t2;
    	let p1;
    	let t3;
    	let p2;
    	let t4;
    	let p3;
    	let t5;
    	let p4;
    	let t6;
    	let exits;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$q] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			h2 = element("h2");
    			t0 = space();
    			p0 = element("p");
    			p0.textContent = "OK, you've indicated that you are going to lie to the Nazi here; that's definitely not all downsides, since your neighbors live. But why did you lie?";
    			t2 = space();
    			p1 = element("p");
    			t3 = space();
    			p2 = element("p");
    			t4 = space();
    			p3 = element("p");
    			t5 = space();
    			p4 = element("p");
    			t6 = space();
    			create_component(exits.$$.fragment);
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t0, anchor);
    			insert(target, p0, anchor);
    			insert(target, t2, anchor);
    			insert(target, p1, anchor);
    			insert(target, t3, anchor);
    			insert(target, p2, anchor);
    			insert(target, t4, anchor);
    			insert(target, p3, anchor);
    			insert(target, t5, anchor);
    			insert(target, p4, anchor);
    			insert(target, t6, anchor);
    			mount_component(exits, target, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t0);
    			if (detaching) detach(p0);
    			if (detaching) detach(t2);
    			if (detaching) detach(p1);
    			if (detaching) detach(t3);
    			if (detaching) detach(p2);
    			if (detaching) detach(t4);
    			if (detaching) detach(p3);
    			if (detaching) detach(t5);
    			if (detaching) detach(p4);
    			if (detaching) detach(t6);
    			destroy_component(exits, detaching);
    		}
    	};
    }

    function instance$r($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Detracknaziactuallylie extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$r, create_fragment$r, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$detracknaziactuallylie$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Detracknaziactuallylie
    });

    /* adventure\detracknaziactuallytelltruth.svelte generated by Svelte v3.47.0 */

    function create_default_slot_1$p(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("I want to try again! Back to the top!");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (21:0) <Exits>
    function create_default_slot$p(ctx) {
    	let link;
    	let current;

    	link = new /*Link*/ ctx[0]({
    			props: {
    				to: "Start",
    				$$slots: { default: [create_default_slot_1$p] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link_changes.$$scope = { dirty, ctx };
    			}

    			link.$set(link_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link, detaching);
    		}
    	};
    }

    function create_fragment$q(ctx) {
    	let h2;
    	let t1;
    	let p0;
    	let t5;
    	let p1;
    	let t9;
    	let p2;
    	let t11;
    	let p3;
    	let t13;
    	let exits;
    	let t14;
    	let a;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$p] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			h2 = element("h2");
    			h2.textContent = "You are a full-stop anti-lying absolutist.";
    			t1 = space();
    			p0 = element("p");
    			p0.innerHTML = `When you were a kid, your parents took you to see <i>Space Jam</i> and as you left the theater a lie shot them both dead. Using the extensive Veritas family fortune, you trained your body, mind, and soul for revenge.`;
    			t5 = space();
    			p1 = element("p");
    			p1.innerHTML = `The point of this branch was to set up a scenario where a lie was as justified as possible. Life-and-limb were at stake and the person being lied to was both terrible and deserved it (if anyone does). But for you there are no gray areas, just one very bright line you won&#39;t cross. The only way to get you to lie is to perhaps trap you in a logical overflow error like an evil computer from <i>Star Trek</i>.`;
    			t9 = space();
    			p2 = element("p");
    			p2.textContent = "This isn't completely fair, but you are one of the few categories who I assumed lied to get here. The claim here is pretty close to \"I never lie\". \"Not lying at all\" is actually pretty tough compared to \"Not lying much\", so I tend to hear claims that one never ever lies with a sceptical, suspicious ear.";
    			t11 = space();
    			p3 = element("p");
    			p3.textContent = "Your funny coded category name is FUANLYAB.";
    			t13 = space();
    			create_component(exits.$$.fragment);
    			t14 = space();
    			a = element("a");
    			a.textContent = "I want to hear your post-writing-this thoughts! Back to the blog!";
    			attr(a, "href", "https://residentcontrarian.com");
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t1, anchor);
    			insert(target, p0, anchor);
    			insert(target, t5, anchor);
    			insert(target, p1, anchor);
    			insert(target, t9, anchor);
    			insert(target, p2, anchor);
    			insert(target, t11, anchor);
    			insert(target, p3, anchor);
    			insert(target, t13, anchor);
    			mount_component(exits, target, anchor);
    			insert(target, t14, anchor);
    			insert(target, a, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t1);
    			if (detaching) detach(p0);
    			if (detaching) detach(t5);
    			if (detaching) detach(p1);
    			if (detaching) detach(t9);
    			if (detaching) detach(p2);
    			if (detaching) detach(t11);
    			if (detaching) detach(p3);
    			if (detaching) detach(t13);
    			destroy_component(exits, detaching);
    			if (detaching) detach(t14);
    			if (detaching) detach(a);
    		}
    	};
    }

    function instance$q($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Detracknaziactuallytelltruth extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$q, create_fragment$q, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$detracknaziactuallytelltruth$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Detracknaziactuallytelltruth
    });

    /* adventure\detracksometimesyousin.svelte generated by Svelte v3.47.0 */

    function create_default_slot_1$o(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("I want to try again! Back to the top!");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (23:0) <Exits>
    function create_default_slot$o(ctx) {
    	let link;
    	let current;

    	link = new /*Link*/ ctx[0]({
    			props: {
    				to: "Start",
    				$$slots: { default: [create_default_slot_1$o] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link_changes.$$scope = { dirty, ctx };
    			}

    			link.$set(link_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link, detaching);
    		}
    	};
    }

    function create_fragment$p(ctx) {
    	let h2;
    	let t1;
    	let p0;
    	let t3;
    	let p1;
    	let t5;
    	let p2;
    	let t7;
    	let p3;
    	let t9;
    	let exits;
    	let t10;
    	let a;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$o] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			h2 = element("h2");
    			h2.textContent = "You are an Imperfect Anti-Lying Absolutist.";
    			t1 = space();
    			p0 = element("p");
    			p0.textContent = "You think the action of lying is wrong, full-stop. The consequences of a lie (or of telling the truth) aren't included in the formula you use to calculate the rightness of the action. Somewhere in your universe, there's a stone slab with \"lying is always wrong\" carved into it, and you think the slab is right.";
    			t3 = space();
    			p1 = element("p");
    			p1.textContent = "With that said, you admit you will actually take the sin-hit and lie in at least some circumstances - for instance, when someone's life is at stake. You might (or might not!) actually lie kind of a lot, but that's an admission you are making about your own imperfection.";
    			t5 = space();
    			p2 = element("p");
    			p2.textContent = "It's worthwhile to note that you are different from someone who has exceptions they believe remove the wrongness from the lie; that exists in a couple different forms in this game, but you aren't it. Bear in mind I'm not judging at all here; \"I think lying is always wrong, but I do it sometimes anyway because I'm not perfect\" is about the strongest claim a person can make about lying that I easily believe.";
    			t7 = space();
    			p3 = element("p");
    			p3.textContent = "Your funny coded category name is IMANLABS.";
    			t9 = space();
    			create_component(exits.$$.fragment);
    			t10 = space();
    			a = element("a");
    			a.textContent = "I want to hear your post-writing-this thoughts! Back to the blog!";
    			attr(a, "href", "https://residentcontrarian.com");
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t1, anchor);
    			insert(target, p0, anchor);
    			insert(target, t3, anchor);
    			insert(target, p1, anchor);
    			insert(target, t5, anchor);
    			insert(target, p2, anchor);
    			insert(target, t7, anchor);
    			insert(target, p3, anchor);
    			insert(target, t9, anchor);
    			mount_component(exits, target, anchor);
    			insert(target, t10, anchor);
    			insert(target, a, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t1);
    			if (detaching) detach(p0);
    			if (detaching) detach(t3);
    			if (detaching) detach(p1);
    			if (detaching) detach(t5);
    			if (detaching) detach(p2);
    			if (detaching) detach(t7);
    			if (detaching) detach(p3);
    			if (detaching) detach(t9);
    			destroy_component(exits, detaching);
    			if (detaching) detach(t10);
    			if (detaching) detach(a);
    		}
    	};
    }

    function instance$p($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Detracksometimesyousin extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$p, create_fragment$p, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$detracksometimesyousin$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Detracksometimesyousin
    });

    /* adventure\detrackwhat.svelte generated by Svelte v3.47.0 */

    function create_default_slot_2$8(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Oops, no, misclick.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (18:1) <Link to=detrackwhat2>
    function create_default_slot_1$n(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Yes, Still.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (16:0) <Exits>
    function create_default_slot$n(ctx) {
    	let link0;
    	let t;
    	let link1;
    	let current;

    	link0 = new /*Link*/ ctx[0]({
    			props: {
    				to: "detrackwhynot",
    				$$slots: { default: [create_default_slot_2$8] },
    				$$scope: { ctx }
    			}
    		});

    	link1 = new /*Link*/ ctx[0]({
    			props: {
    				to: "detrackwhat2",
    				$$slots: { default: [create_default_slot_1$n] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link0.$$.fragment);
    			t = space();
    			create_component(link1.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link0, target, anchor);
    			insert(target, t, anchor);
    			mount_component(link1, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link0_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link0_changes.$$scope = { dirty, ctx };
    			}

    			link0.$set(link0_changes);
    			const link1_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link1_changes.$$scope = { dirty, ctx };
    			}

    			link1.$set(link1_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link0.$$.fragment, local);
    			transition_in(link1.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link0.$$.fragment, local);
    			transition_out(link1.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link0, detaching);
    			if (detaching) detach(t);
    			destroy_component(link1, detaching);
    		}
    	};
    }

    function create_fragment$o(ctx) {
    	let h2;
    	let t0;
    	let p;
    	let t2;
    	let exits;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$n] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			h2 = element("h2");
    			t0 = space();
    			p = element("p");
    			p.textContent = "Really? This is a nice family. Let's say Nazis are the abstract-concept version of Nazis; there's no reasoning behind what they are doing, no justifications at all besides doing bad things to good people. Is it still wrong to lie to save them?";
    			t2 = space();
    			create_component(exits.$$.fragment);
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t0, anchor);
    			insert(target, p, anchor);
    			insert(target, t2, anchor);
    			mount_component(exits, target, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t0);
    			if (detaching) detach(p);
    			if (detaching) detach(t2);
    			destroy_component(exits, detaching);
    		}
    	};
    }

    function instance$o($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Detrackwhat extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$o, create_fragment$o, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$detrackwhat$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Detrackwhat
    });

    /* adventure\detrackwhat2.svelte generated by Svelte v3.47.0 */

    function create_default_slot_2$7(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("I'd tell the truth. A lie is a lie, and it's wrong to lie.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (29:1) <Link to=detracknaziactuallylie>
    function create_default_slot_1$m(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("I think I'd actually probably lie here.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (27:0) <Exits>
    function create_default_slot$m(ctx) {
    	let link0;
    	let t;
    	let link1;
    	let current;

    	link0 = new /*Link*/ ctx[0]({
    			props: {
    				to: "detracknaziactuallytelltruth",
    				$$slots: { default: [create_default_slot_2$7] },
    				$$scope: { ctx }
    			}
    		});

    	link1 = new /*Link*/ ctx[0]({
    			props: {
    				to: "detracknaziactuallylie",
    				$$slots: { default: [create_default_slot_1$m] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link0.$$.fragment);
    			t = space();
    			create_component(link1.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link0, target, anchor);
    			insert(target, t, anchor);
    			mount_component(link1, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link0_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link0_changes.$$scope = { dirty, ctx };
    			}

    			link0.$set(link0_changes);
    			const link1_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link1_changes.$$scope = { dirty, ctx };
    			}

    			link1.$set(link1_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link0.$$.fragment, local);
    			transition_in(link1.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link0.$$.fragment, local);
    			transition_out(link1.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link0, detaching);
    			if (detaching) detach(t);
    			destroy_component(link1, detaching);
    		}
    	};
    }

    function create_fragment$n(ctx) {
    	let h2;
    	let t0;
    	let p0;
    	let t2;
    	let p1;
    	let t4;
    	let p2;
    	let t6;
    	let p3;
    	let t7;
    	let p4;
    	let t8;
    	let exits;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$m] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			h2 = element("h2");
    			t0 = space();
    			p0 = element("p");
    			p0.textContent = "Wow, OK, got it.";
    			t2 = space();
    			p1 = element("p");
    			p1.textContent = "As previously noted, the assumption here is that this is the worst-case scenario; by saying it's wrong to lie here, you are saying it's wrong to lie in any stand-alone situation whatsoever. But that's what you believe is right or wrong, not what you'd actually do.";
    			t4 = space();
    			p2 = element("p");
    			p2.textContent = "Taking as a given that you think it would be wrong to lie here, what do you think you'd actually do in this situation?";
    			t6 = space();
    			p3 = element("p");
    			t7 = space();
    			p4 = element("p");
    			t8 = space();
    			create_component(exits.$$.fragment);
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t0, anchor);
    			insert(target, p0, anchor);
    			insert(target, t2, anchor);
    			insert(target, p1, anchor);
    			insert(target, t4, anchor);
    			insert(target, p2, anchor);
    			insert(target, t6, anchor);
    			insert(target, p3, anchor);
    			insert(target, t7, anchor);
    			insert(target, p4, anchor);
    			insert(target, t8, anchor);
    			mount_component(exits, target, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t0);
    			if (detaching) detach(p0);
    			if (detaching) detach(t2);
    			if (detaching) detach(p1);
    			if (detaching) detach(t4);
    			if (detaching) detach(p2);
    			if (detaching) detach(t6);
    			if (detaching) detach(p3);
    			if (detaching) detach(t7);
    			if (detaching) detach(p4);
    			if (detaching) detach(t8);
    			destroy_component(exits, detaching);
    		}
    	};
    }

    function instance$n($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Detrackwhat2 extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$n, create_fragment$n, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$detrackwhat2$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Detrackwhat2
    });

    /* adventure\detrackwhynot.svelte generated by Svelte v3.47.0 */

    function create_default_slot_2$6(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("It's not exactly lying at that point.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (16:1) <Link to=detracknaziactuallylie>
    function create_default_slot_1$l(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("It's not really wrong at that point, or something like that.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (14:0) <Exits>
    function create_default_slot$l(ctx) {
    	let link0;
    	let t;
    	let link1;
    	let current;

    	link0 = new /*Link*/ ctx[0]({
    			props: {
    				to: "detrackmitigate",
    				$$slots: { default: [create_default_slot_2$6] },
    				$$scope: { ctx }
    			}
    		});

    	link1 = new /*Link*/ ctx[0]({
    			props: {
    				to: "detracknaziactuallylie",
    				$$slots: { default: [create_default_slot_1$l] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link0.$$.fragment);
    			t = space();
    			create_component(link1.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link0, target, anchor);
    			insert(target, t, anchor);
    			mount_component(link1, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link0_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link0_changes.$$scope = { dirty, ctx };
    			}

    			link0.$set(link0_changes);
    			const link1_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link1_changes.$$scope = { dirty, ctx };
    			}

    			link1.$set(link1_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link0.$$.fragment, local);
    			transition_in(link1.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link0.$$.fragment, local);
    			transition_out(link1.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link0, detaching);
    			if (detaching) detach(t);
    			destroy_component(link1, detaching);
    		}
    	};
    }

    function create_fragment$m(ctx) {
    	let p;
    	let t1;
    	let exits;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$l] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			p = element("p");
    			p.textContent = "Why not? You told me lying was abstractly wrong a minute ago; what changed?";
    			t1 = space();
    			create_component(exits.$$.fragment);
    		},
    		m(target, anchor) {
    			insert(target, p, anchor);
    			insert(target, t1, anchor);
    			mount_component(exits, target, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(p);
    			if (detaching) detach(t1);
    			destroy_component(exits, detaching);
    		}
    	};
    }

    function instance$m($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Detrackwhynot extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$m, create_fragment$m, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$detrackwhynot$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Detrackwhynot
    });

    /* adventure\detractconfork.svelte generated by Svelte v3.47.0 */

    function create_default_slot_1$k(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("...");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (27:0) <Exits>
    function create_default_slot$k(ctx) {
    	let link;
    	let current;

    	link = new /*Link*/ ctx[0]({
    			props: {
    				to: "contrack",
    				$$slots: { default: [create_default_slot_1$k] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link_changes.$$scope = { dirty, ctx };
    			}

    			link.$set(link_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link, detaching);
    		}
    	};
    }

    function create_fragment$l(ctx) {
    	let h2;
    	let t0;
    	let p0;
    	let t2;
    	let p1;
    	let t4;
    	let p2;
    	let t6;
    	let p3;
    	let t8;
    	let p4;
    	let t9;
    	let exits;
    	let t10;
    	let a;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$k] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			h2 = element("h2");
    			t0 = space();
    			p0 = element("p");
    			p0.textContent = "Listen, man. To the extent there's defined sides of this quiz, you are essentially on the deontology side. That's supposed to be the easy side for me to write! Here you come, being all weird about it, and now you probably want me to branch off into like ninety different forks to capture whatever weird quibble you have about this. I have a tree outside that has branch problems; this guy from church named Hector helped me cut off some of it but he's telling me I need to hire an arborist or something to make sure I don't lose the tree.";
    			t2 = space();
    			p1 = element("p");
    			p1.textContent = "You think I want MORE branch problems, even if they are in this test? Nope.";
    			t4 = space();
    			p2 = element("p");
    			p2.textContent = "In the first page of this, I asked if you thought lying was absolutely wrong, and in the last page I gave you two ways to resolve your whole thing that didn't threaten that absolutism. Then you told me you think things are wrong conditioned on their consequences!";
    			t6 = space();
    			p3 = element("p");
    			p3.textContent = "I'm kicking you out of the deontology side of the test. You have been banished to consequentialism. And so help me, if I hear so much as another word, I'm sending you to the Labyrinth of a myriad myriad words. This is a place where meaning is eschewed in favor suffering, a place where letters are assembled as if by diabolists bent on creating an exitless hell of mastubatory prose, a place where there is nothing to be learned and the only escape is death.";
    			t8 = space();
    			p4 = element("p");
    			t9 = space();
    			create_component(exits.$$.fragment);
    			t10 = space();
    			a = element("a");
    			a.textContent = "Wait! I really think you should consider this...";
    			attr(a, "href", "https://www.amazon.com/dp/B09PDRBVHL");
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t0, anchor);
    			insert(target, p0, anchor);
    			insert(target, t2, anchor);
    			insert(target, p1, anchor);
    			insert(target, t4, anchor);
    			insert(target, p2, anchor);
    			insert(target, t6, anchor);
    			insert(target, p3, anchor);
    			insert(target, t8, anchor);
    			insert(target, p4, anchor);
    			insert(target, t9, anchor);
    			mount_component(exits, target, anchor);
    			insert(target, t10, anchor);
    			insert(target, a, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t0);
    			if (detaching) detach(p0);
    			if (detaching) detach(t2);
    			if (detaching) detach(p1);
    			if (detaching) detach(t4);
    			if (detaching) detach(p2);
    			if (detaching) detach(t6);
    			if (detaching) detach(p3);
    			if (detaching) detach(t8);
    			if (detaching) detach(p4);
    			if (detaching) detach(t9);
    			destroy_component(exits, detaching);
    			if (detaching) detach(t10);
    			if (detaching) detach(a);
    		}
    	};
    }

    function instance$l($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Detractconfork extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$l, create_fragment$l, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$detractconfork$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Detractconfork
    });

    /* adventure\knowledgedisregard.svelte generated by Svelte v3.47.0 */

    function create_default_slot_1$j(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("I want to try again! Back to the top!");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (23:0) <Exits>
    function create_default_slot$j(ctx) {
    	let link;
    	let current;

    	link = new /*Link*/ ctx[0]({
    			props: {
    				to: "Start",
    				$$slots: { default: [create_default_slot_1$j] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link_changes.$$scope = { dirty, ctx };
    			}

    			link.$set(link_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link, detaching);
    		}
    	};
    }

    function create_fragment$k(ctx) {
    	let h2;
    	let t1;
    	let p0;
    	let t3;
    	let p1;
    	let t5;
    	let p2;
    	let t7;
    	let p3;
    	let t9;
    	let exits;
    	let t10;
    	let a;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$j] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			h2 = element("h2");
    			h2.textContent = "Your are an Omniscient Consequentionalist Paternalist.";
    			t1 = space();
    			p0 = element("p");
    			p0.textContent = "You care about consequences, and only consequences. You know all outcomes, and only all outcomes. Where people say they prefer to know the truth, consequences be damned, you know better and enforce your will upon them lest they lead themselves astray.";
    			t3 = space();
    			p1 = element("p");
    			p1.textContent = "There's a few different end-states in this project that I basically suspect don't exist in real life; this is one, for reasons you probably find clear. But I feel like this is also a situation which would come up in thought problems, since the level to which you can predict outcomes is pretty important to how viable consequentialism is as a moral system.";
    			t5 = space();
    			p2 = element("p");
    			p2.textContent = "There's other endings where the liar is disregarding the wishes of the lied to, but for the record I like this one more than most of them; at least here the person is pretty certain they are maximizing utility, even if they might be mistaken.";
    			t7 = space();
    			p3 = element("p");
    			p3.textContent = "Your funny coded category name is PAPAOMNICON.";
    			t9 = space();
    			create_component(exits.$$.fragment);
    			t10 = space();
    			a = element("a");
    			a.textContent = "I want to hear your post-writing-this thoughts! Back to the blog!";
    			attr(a, "href", "https://residentcontrarian.com");
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t1, anchor);
    			insert(target, p0, anchor);
    			insert(target, t3, anchor);
    			insert(target, p1, anchor);
    			insert(target, t5, anchor);
    			insert(target, p2, anchor);
    			insert(target, t7, anchor);
    			insert(target, p3, anchor);
    			insert(target, t9, anchor);
    			mount_component(exits, target, anchor);
    			insert(target, t10, anchor);
    			insert(target, a, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t1);
    			if (detaching) detach(p0);
    			if (detaching) detach(t3);
    			if (detaching) detach(p1);
    			if (detaching) detach(t5);
    			if (detaching) detach(p2);
    			if (detaching) detach(t7);
    			if (detaching) detach(p3);
    			if (detaching) detach(t9);
    			destroy_component(exits, detaching);
    			if (detaching) detach(t10);
    			if (detaching) detach(a);
    		}
    	};
    }

    function instance$k($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Knowledgedisregard extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$k, create_fragment$k, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$knowledgedisregard$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Knowledgedisregard
    });

    /* adventure\knowledgerespect.svelte generated by Svelte v3.47.0 */

    function create_default_slot_1$i(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("I want to try again! Back to the top!");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (21:0) <Exits>
    function create_default_slot$i(ctx) {
    	let link;
    	let current;

    	link = new /*Link*/ ctx[0]({
    			props: {
    				to: "Start",
    				$$slots: { default: [create_default_slot_1$i] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link_changes.$$scope = { dirty, ctx };
    			}

    			link.$set(link_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link, detaching);
    		}
    	};
    }

    function create_fragment$j(ctx) {
    	let h2;
    	let t1;
    	let p0;
    	let t3;
    	let p1;
    	let t5;
    	let p2;
    	let t7;
    	let exits;
    	let t8;
    	let a;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$i] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			h2 = element("h2");
    			h2.textContent = "Your are a Laissez-Faire Omniscient Consequentionalist.";
    			t1 = space();
    			p0 = element("p");
    			p0.textContent = "You care about consequences, and only consequences. You know all outcomes, and only all outcomes. Where people say they prefer to know the truth you respect that, outcomes be damned.";
    			t3 = space();
    			p1 = element("p");
    			p1.textContent = "As in some other cases, I don't actually believe you can predict the future. Probably neither do you. As stated elsewhere, though, this is just a good thought problem category so I'm leaving it in. I sometimes wonder if some people aren't mentally editing \"and this is a knowable thing you can know\" to the end of the \"The good of an act is determined by its consequences\" short description of consequentialism. I don't know if they are or aren't, but I know it's the first stop on strawman-tour of the whole deal.";
    			t5 = space();
    			p2 = element("p");
    			p2.textContent = "Your funny coded category name is PAPAOMNICON.";
    			t7 = space();
    			create_component(exits.$$.fragment);
    			t8 = space();
    			a = element("a");
    			a.textContent = "I want to hear your post-writing-this thoughts! Back to the blog!";
    			attr(a, "href", "https://residentcontrarian.com");
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t1, anchor);
    			insert(target, p0, anchor);
    			insert(target, t3, anchor);
    			insert(target, p1, anchor);
    			insert(target, t5, anchor);
    			insert(target, p2, anchor);
    			insert(target, t7, anchor);
    			mount_component(exits, target, anchor);
    			insert(target, t8, anchor);
    			insert(target, a, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t1);
    			if (detaching) detach(p0);
    			if (detaching) detach(t3);
    			if (detaching) detach(p1);
    			if (detaching) detach(t5);
    			if (detaching) detach(p2);
    			if (detaching) detach(t7);
    			destroy_component(exits, detaching);
    			if (detaching) detach(t8);
    			if (detaching) detach(a);
    		}
    	};
    }

    function instance$j($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Knowledgerespect extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$j, create_fragment$j, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$knowledgerespect$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Knowledgerespect
    });

    /* adventure\netneglie.svelte generated by Svelte v3.47.0 */

    function create_default_slot_2$5(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("I'm training!");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (19:1) <Link to=burn>
    function create_default_slot_1$h(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Because screw them, that's why.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (17:0) <Exits>
    function create_default_slot$h(ctx) {
    	let link0;
    	let t;
    	let link1;
    	let current;

    	link0 = new /*Link*/ ctx[0]({
    			props: {
    				to: "oliempics",
    				$$slots: { default: [create_default_slot_2$5] },
    				$$scope: { ctx }
    			}
    		});

    	link1 = new /*Link*/ ctx[0]({
    			props: {
    				to: "burn",
    				$$slots: { default: [create_default_slot_1$h] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link0.$$.fragment);
    			t = space();
    			create_component(link1.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link0, target, anchor);
    			insert(target, t, anchor);
    			mount_component(link1, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link0_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link0_changes.$$scope = { dirty, ctx };
    			}

    			link0.$set(link0_changes);
    			const link1_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link1_changes.$$scope = { dirty, ctx };
    			}

    			link1.$set(link1_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link0.$$.fragment, local);
    			transition_in(link1.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link0.$$.fragment, local);
    			transition_out(link1.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link0, detaching);
    			if (detaching) detach(t);
    			destroy_component(link1, detaching);
    		}
    	};
    }

    function create_fragment$i(ctx) {
    	let p0;
    	let t1;
    	let p1;
    	let t3;
    	let exits;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$h] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			p0 = element("p");
    			p0.textContent = "The narrator shifted uncomfortably in his seat. He had heard about cases like this in interactive non-fiction school, but had never expected to see one in the wild. Suddenly all he wanted was to put too much sriracha in a instant noodle cup, curl up on his couch, and forget the surprising and diverse dangers of the world around him.";
    			t1 = space();
    			p1 = element("p");
    			p1.textContent = "He eyed the test-taker warily, like a hunter eyes a cornered bear with a liberal arts degree. \"Why is that?\" he asked, keeping his voice even and soothing.";
    			t3 = space();
    			create_component(exits.$$.fragment);
    		},
    		m(target, anchor) {
    			insert(target, p0, anchor);
    			insert(target, t1, anchor);
    			insert(target, p1, anchor);
    			insert(target, t3, anchor);
    			mount_component(exits, target, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(p0);
    			if (detaching) detach(t1);
    			if (detaching) detach(p1);
    			if (detaching) detach(t3);
    			destroy_component(exits, detaching);
    		}
    	};
    }

    function instance$i($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Netneglie extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$i, create_fragment$i, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$netneglie$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Netneglie
    });

    /* adventure\nouncertainlie.svelte generated by Svelte v3.47.0 */

    function create_default_slot_1$g(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("I want to try again! Back to the top!");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (23:0) <Exits>
    function create_default_slot$g(ctx) {
    	let link;
    	let current;

    	link = new /*Link*/ ctx[0]({
    			props: {
    				to: "Start",
    				$$slots: { default: [create_default_slot_1$g] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link_changes.$$scope = { dirty, ctx };
    			}

    			link.$set(link_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link, detaching);
    		}
    	};
    }

    function create_fragment$h(ctx) {
    	let h2;
    	let t1;
    	let p0;
    	let t3;
    	let p1;
    	let t5;
    	let p2;
    	let t8;
    	let p3;
    	let t10;
    	let exits;
    	let t11;
    	let a;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$g] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			h2 = element("h2");
    			h2.textContent = "You are a Risk-Averse Consequentialist.";
    			t1 = space();
    			p0 = element("p");
    			p0.textContent = "You think that it's basically OK to lie, or at least not definitionally bad. When you have the strong expectation that your lies will produce good, you do it. No worries. There's only one problem: You are skittish like a tiny baby bunny.";
    			t3 = space();
    			p1 = element("p");
    			p1.textContent = "If you were a cold, cool calculation machine, you'd be comfortable lying or not lying at even good/bad odds based on personal preference alone. But something is holding you back - either you think that people illogically don't like people trying to deceive them and might unfairly villianize you for your well-meaning trickery, or you have some cultural aversion to lying sticking to your brain like a faux-righteous stain, or something.";
    			t5 = space();
    			p2 = element("p");
    			p2.innerHTML = `The point is that I&#39;m going to need you to toughen up, my friend. When you break some eggs, you can&#39;t run away just because <i>omelettes are happening.</i>`;
    			t8 = space();
    			p3 = element("p");
    			p3.textContent = "Your funny coded category name is GETSOMETHICKERSKINYOUCOWARD.";
    			t10 = space();
    			create_component(exits.$$.fragment);
    			t11 = space();
    			a = element("a");
    			a.textContent = "I want to hear your post-writing-this thoughts! Back to the blog!";
    			attr(a, "href", "https://residentcontrarian.com");
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t1, anchor);
    			insert(target, p0, anchor);
    			insert(target, t3, anchor);
    			insert(target, p1, anchor);
    			insert(target, t5, anchor);
    			insert(target, p2, anchor);
    			insert(target, t8, anchor);
    			insert(target, p3, anchor);
    			insert(target, t10, anchor);
    			mount_component(exits, target, anchor);
    			insert(target, t11, anchor);
    			insert(target, a, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t1);
    			if (detaching) detach(p0);
    			if (detaching) detach(t3);
    			if (detaching) detach(p1);
    			if (detaching) detach(t5);
    			if (detaching) detach(p2);
    			if (detaching) detach(t8);
    			if (detaching) detach(p3);
    			if (detaching) detach(t10);
    			destroy_component(exits, detaching);
    			if (detaching) detach(t11);
    			if (detaching) detach(a);
    		}
    	};
    }

    function instance$h($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Nouncertainlie extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$h, create_fragment$h, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$nouncertainlie$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Nouncertainlie
    });

    /* adventure\oliempics.svelte generated by Svelte v3.47.0 */

    function create_default_slot_1$f(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Yeah, like, the deal is you said directly stemming from that lie. And yes, that can be interpreted to mean basically anything that happens in the future at all. But in terms of what I could reasonably track off this lie, it might be a net negative at least in terms of what I could see. But what if there was a \"big score\" on the way, so to speak? I want to keep sharp. I don't want my deceptive capacities dulled by infrequent use. I want to be ready for that one big lie that changes the world.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (24:0) <Exits>
    function create_default_slot$f(ctx) {
    	let link;
    	let current;

    	link = new /*Link*/ ctx[0]({
    			props: {
    				to: "oliempics2",
    				$$slots: { default: [create_default_slot_1$f] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link_changes.$$scope = { dirty, ctx };
    			}

    			link.$set(link_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link, detaching);
    		}
    	};
    }

    function create_fragment$g(ctx) {
    	let h2;
    	let t0;
    	let p0;
    	let t2;
    	let p1;
    	let t3;
    	let p2;
    	let t4;
    	let p3;
    	let t5;
    	let p4;
    	let t6;
    	let exits;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$f] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			h2 = element("h2");
    			t0 = space();
    			p0 = element("p");
    			p0.textContent = "Training?";
    			t2 = space();
    			p1 = element("p");
    			t3 = space();
    			p2 = element("p");
    			t4 = space();
    			p3 = element("p");
    			t5 = space();
    			p4 = element("p");
    			t6 = space();
    			create_component(exits.$$.fragment);
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t0, anchor);
    			insert(target, p0, anchor);
    			insert(target, t2, anchor);
    			insert(target, p1, anchor);
    			insert(target, t3, anchor);
    			insert(target, p2, anchor);
    			insert(target, t4, anchor);
    			insert(target, p3, anchor);
    			insert(target, t5, anchor);
    			insert(target, p4, anchor);
    			insert(target, t6, anchor);
    			mount_component(exits, target, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t0);
    			if (detaching) detach(p0);
    			if (detaching) detach(t2);
    			if (detaching) detach(p1);
    			if (detaching) detach(t3);
    			if (detaching) detach(p2);
    			if (detaching) detach(t4);
    			if (detaching) detach(p3);
    			if (detaching) detach(t5);
    			if (detaching) detach(p4);
    			if (detaching) detach(t6);
    			destroy_component(exits, detaching);
    		}
    	};
    }

    function instance$g($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Oliempics extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$g, create_fragment$g, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$oliempics$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Oliempics
    });

    /* adventure\oliempics2.svelte generated by Svelte v3.47.0 */

    function create_default_slot_1$e(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("I want to try again! Back to the top!");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (22:0) <Exits>
    function create_default_slot$e(ctx) {
    	let link;
    	let current;

    	link = new /*Link*/ ctx[0]({
    			props: {
    				to: "Start",
    				$$slots: { default: [create_default_slot_1$e] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link_changes.$$scope = { dirty, ctx };
    			}

    			link.$set(link_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link, detaching);
    		}
    	};
    }

    function create_fragment$f(ctx) {
    	let h2;
    	let t1;
    	let p0;
    	let t3;
    	let p1;
    	let t7;
    	let p2;
    	let t9;
    	let exits;
    	let t10;
    	let a;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$e] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			h2 = element("h2");
    			h2.textContent = "You are a Long-Termist Dishonesty Prepper Consequentialist.";
    			t1 = space();
    			p0 = element("p");
    			p0.textContent = "You think most people only get one big shot at joining the big show. You are like Eminem in eight mile, waiting for you big break. Training. Meditating. Growing. The big difference is that you aren't going to rap at the opportunity so much as you are going to lie at it.";
    			t3 = space();
    			p1 = element("p");
    			p1.innerHTML = `Like a person shooting random passers-by from his balcony to dull his emotions in anticipation of an expected eventual <i>Red Dawn</i> situation, you are trading more certainty of benefit now for black-swan sort of payout at the end of the road. Like a boyscout, you are ready; unlike a boyscout... well, you get it.`;
    			t7 = space();
    			p2 = element("p");
    			p2.textContent = "Your funny coded category name is OLIEMPIAN.";
    			t9 = space();
    			create_component(exits.$$.fragment);
    			t10 = space();
    			a = element("a");
    			a.textContent = "I want to hear your post-writing-this thoughts! Back to the blog!";
    			attr(a, "href", "https://residentcontrarian.com");
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t1, anchor);
    			insert(target, p0, anchor);
    			insert(target, t3, anchor);
    			insert(target, p1, anchor);
    			insert(target, t7, anchor);
    			insert(target, p2, anchor);
    			insert(target, t9, anchor);
    			mount_component(exits, target, anchor);
    			insert(target, t10, anchor);
    			insert(target, a, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t1);
    			if (detaching) detach(p0);
    			if (detaching) detach(t3);
    			if (detaching) detach(p1);
    			if (detaching) detach(t7);
    			if (detaching) detach(p2);
    			if (detaching) detach(t9);
    			destroy_component(exits, detaching);
    			if (detaching) detach(t10);
    			if (detaching) detach(a);
    		}
    	};
    }

    function instance$f($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Oliempics2 extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$f, create_fragment$f, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$oliempics2$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Oliempics2
    });

    /* adventure\scalesofgood.svelte generated by Svelte v3.47.0 */

    function create_default_slot_1$d(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("I want to try again! Back to the top!");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (23:0) <Exits>
    function create_default_slot$d(ctx) {
    	let link;
    	let current;

    	link = new /*Link*/ ctx[0]({
    			props: {
    				to: "Start",
    				$$slots: { default: [create_default_slot_1$d] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link_changes.$$scope = { dirty, ctx };
    			}

    			link.$set(link_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link, detaching);
    		}
    	};
    }

    function create_fragment$e(ctx) {
    	let h2;
    	let t1;
    	let p0;
    	let t3;
    	let p1;
    	let t7;
    	let p2;
    	let t9;
    	let p3;
    	let t11;
    	let exits;
    	let t12;
    	let a;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$d] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			h2 = element("h2");
    			h2.textContent = "You are a scales-of-good pure deontologist.";
    			t1 = space();
    			p0 = element("p");
    			p0.textContent = "You are a pure deontologist; you think rules are rules, and that breaking or obeying them is what determines the goodness of your actions. But you've found that sometimes rules conflict with each other, and when that happens things get weird for you.";
    			t3 = space();
    			p1 = element("p");
    			p1.innerHTML = `In this case, you&#39;ve been pretty consistent that you think that lying is wrong. But you also indicated that something like &quot;letting your neighbors get holocausted&quot; seems <i>more wrong</i> to you, so you don&#39;t do it. On net, you come out ahead - not so good as if you weren&#39;t asked to lie at all, but not as bad as setting murders on the track of good folks. This differs a bit from consequentialism in that you still feel like you did something wrong; where they&#39;d go &quot;whoo! utility maximized!&quot;, you still feel bad; you sinned, just not maximally so.`;
    			t7 = space();
    			p2 = element("p");
    			p2.textContent = "As with all systems where your judgment is a significant input, this can get risky. If the system providing your rules to you has a clearly defined hierarchy, that's easy. But if you are making the severity-of-sin choices yourself, you run into the risk that all flexible-sytem users do - that you eventually acclimate to the flexibility and end up a deontologist in name only.";
    			t9 = space();
    			p3 = element("p");
    			p3.textContent = "Your funny coded category name is SCAPUDE.";
    			t11 = space();
    			create_component(exits.$$.fragment);
    			t12 = space();
    			a = element("a");
    			a.textContent = "I want to hear your post-writing-this thoughts! Back to the blog!";
    			attr(a, "href", "https://residentcontrarian.com");
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t1, anchor);
    			insert(target, p0, anchor);
    			insert(target, t3, anchor);
    			insert(target, p1, anchor);
    			insert(target, t7, anchor);
    			insert(target, p2, anchor);
    			insert(target, t9, anchor);
    			insert(target, p3, anchor);
    			insert(target, t11, anchor);
    			mount_component(exits, target, anchor);
    			insert(target, t12, anchor);
    			insert(target, a, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t1);
    			if (detaching) detach(p0);
    			if (detaching) detach(t3);
    			if (detaching) detach(p1);
    			if (detaching) detach(t7);
    			if (detaching) detach(p2);
    			if (detaching) detach(t9);
    			if (detaching) detach(p3);
    			if (detaching) detach(t11);
    			destroy_component(exits, detaching);
    			if (detaching) detach(t12);
    			if (detaching) detach(a);
    		}
    	};
    }

    function instance$e($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Scalesofgood extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$e, create_fragment$e, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$scalesofgood$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Scalesofgood
    });

    /* adventure\thedeferential.svelte generated by Svelte v3.47.0 */

    function create_default_slot_1$c(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("I want to try again! Back to the top!");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (23:0) <Exits>
    function create_default_slot$c(ctx) {
    	let link;
    	let current;

    	link = new /*Link*/ ctx[0]({
    			props: {
    				to: "Start",
    				$$slots: { default: [create_default_slot_1$c] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link_changes.$$scope = { dirty, ctx };
    			}

    			link.$set(link_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link, detaching);
    		}
    	};
    }

    function create_fragment$d(ctx) {
    	let h2;
    	let t1;
    	let p0;
    	let t3;
    	let p1;
    	let t5;
    	let p2;
    	let t9;
    	let p3;
    	let t11;
    	let exits;
    	let t12;
    	let a;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$c] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			h2 = element("h2");
    			h2.textContent = "You are a Logical Consequentialist Desire Acknowledger.";
    			t1 = space();
    			p0 = element("p");
    			p0.textContent = "Where it makes sense to lie, you trust your own judgment and lie. Someone might ask why you are so certain, but it almost doesn't matter on a case-by-case basis; after all, what better judgment could you have at any given moment than your best judgment? Not every situation allows for days of research. You do the best you can.";
    			t3 = space();
    			p1 = element("p");
    			p1.textContent = "That said, there's an exception: When someone assures you that their utility would suffer from your dishonesty, you tend to take their word for it. Not only do they have the potential of knowing something you don't (since they are so close to the situation), they also \"own\" some of the benefit, and you think it's theirs to take or not take based on their own preference.";
    			t5 = space();
    			p2 = element("p");
    			p2.innerHTML = `There&#39;s a version of you (one page back, take the other option) who <i>doesn&#39;t</i> think the person you are lying to should get any say in the matter. He&#39;s probably a bit more logical in terms of what you&#39;d expect from the cold hard definitions of Consequentialism as a moral system, but I suspect your category has more members than his; not everyone wants to brave the kind of ignorant, lie-hating reactions they would have to weather if their lies were known.`;
    			t9 = space();
    			p3 = element("p");
    			p3.textContent = "Your funny coded category name is THEDEFERENT.";
    			t11 = space();
    			create_component(exits.$$.fragment);
    			t12 = space();
    			a = element("a");
    			a.textContent = "I want to hear your post-writing-this thoughts! Back to the blog!";
    			attr(a, "href", "https://residentcontrarian.com");
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t1, anchor);
    			insert(target, p0, anchor);
    			insert(target, t3, anchor);
    			insert(target, p1, anchor);
    			insert(target, t5, anchor);
    			insert(target, p2, anchor);
    			insert(target, t9, anchor);
    			insert(target, p3, anchor);
    			insert(target, t11, anchor);
    			mount_component(exits, target, anchor);
    			insert(target, t12, anchor);
    			insert(target, a, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t1);
    			if (detaching) detach(p0);
    			if (detaching) detach(t3);
    			if (detaching) detach(p1);
    			if (detaching) detach(t5);
    			if (detaching) detach(p2);
    			if (detaching) detach(t9);
    			if (detaching) detach(p3);
    			if (detaching) detach(t11);
    			destroy_component(exits, detaching);
    			if (detaching) detach(t12);
    			if (detaching) detach(a);
    		}
    	};
    }

    function instance$d($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Thedeferential extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$d, create_fragment$d, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$thedeferential$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Thedeferential
    });

    /* adventure\thegenius.svelte generated by Svelte v3.47.0 */

    function create_default_slot_1$b(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("I want to try again! Back to the top!");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (21:0) <Exits>
    function create_default_slot$b(ctx) {
    	let link;
    	let current;

    	link = new /*Link*/ ctx[0]({
    			props: {
    				to: "Start",
    				$$slots: { default: [create_default_slot_1$b] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link_changes.$$scope = { dirty, ctx };
    			}

    			link.$set(link_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link, detaching);
    		}
    	};
    }

    function create_fragment$c(ctx) {
    	let h2;
    	let t1;
    	let p0;
    	let t3;
    	let p1;
    	let t5;
    	let p2;
    	let t7;
    	let exits;
    	let t8;
    	let a;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$b] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			h2 = element("h2");
    			h2.textContent = "You are a Logical Consequentialist Dictator.";
    			t1 = space();
    			p0 = element("p");
    			p0.textContent = "You are a pretty stock interpretation of a Wikipedia-level understanding of consequentialism - I know, because that's the level I understand consequentialism at and this is about what I expected from you.";
    			t3 = space();
    			p1 = element("p");
    			p1.textContent = "You will lie any time it seems like there will probably be a net benefit from doing so. You will also, as a bonus, lie to someone who is very clear in telling you they don't want that. This is convenient, since most people don't like being lied to. You are pretty sure you are smarter than them, even to the point where your second-party information disadvantage mitigates their first-party knowledge of their own situation. You also don't put weight on their preference and desires, or at least not enough to keep you from doing what you decided was right anyway.";
    			t5 = space();
    			p2 = element("p");
    			p2.textContent = "Your funny coded category name is THEGENIUS.";
    			t7 = space();
    			create_component(exits.$$.fragment);
    			t8 = space();
    			a = element("a");
    			a.textContent = "I want to hear your post-writing-this thoughts! Back to the blog!";
    			attr(a, "href", "https://residentcontrarian.com");
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t1, anchor);
    			insert(target, p0, anchor);
    			insert(target, t3, anchor);
    			insert(target, p1, anchor);
    			insert(target, t5, anchor);
    			insert(target, p2, anchor);
    			insert(target, t7, anchor);
    			mount_component(exits, target, anchor);
    			insert(target, t8, anchor);
    			insert(target, a, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t1);
    			if (detaching) detach(p0);
    			if (detaching) detach(t3);
    			if (detaching) detach(p1);
    			if (detaching) detach(t5);
    			if (detaching) detach(p2);
    			if (detaching) detach(t7);
    			destroy_component(exits, detaching);
    			if (detaching) detach(t8);
    			if (detaching) detach(a);
    		}
    	};
    }

    function instance$c($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Thegenius extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$c, create_fragment$c, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$thegenius$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Thegenius
    });

    /* adventure\uncertainlie.svelte generated by Svelte v3.47.0 */

    function create_default_slot_2$4(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("No, I wouldn't lie in that situation.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (26:1) <Link to=netneglie>
    function create_default_slot_1$a(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Yes, I would lie at a less-than-50% good-consequence certainty.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (24:0) <Exits>
    function create_default_slot$a(ctx) {
    	let link0;
    	let t;
    	let link1;
    	let current;

    	link0 = new /*Link*/ ctx[0]({
    			props: {
    				to: "uncertainlie2",
    				$$slots: { default: [create_default_slot_2$4] },
    				$$scope: { ctx }
    			}
    		});

    	link1 = new /*Link*/ ctx[0]({
    			props: {
    				to: "netneglie",
    				$$slots: { default: [create_default_slot_1$a] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link0.$$.fragment);
    			t = space();
    			create_component(link1.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link0, target, anchor);
    			insert(target, t, anchor);
    			mount_component(link1, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link0_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link0_changes.$$scope = { dirty, ctx };
    			}

    			link0.$set(link0_changes);
    			const link1_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link1_changes.$$scope = { dirty, ctx };
    			}

    			link1.$set(link1_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link0.$$.fragment, local);
    			transition_in(link1.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link0.$$.fragment, local);
    			transition_out(link1.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link0, detaching);
    			if (detaching) detach(t);
    			destroy_component(link1, detaching);
    		}
    	};
    }

    function create_fragment$b(ctx) {
    	let h2;
    	let t0;
    	let p0;
    	let t2;
    	let p1;
    	let t4;
    	let p2;
    	let t5;
    	let p3;
    	let t6;
    	let p4;
    	let t7;
    	let exits;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$a] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			h2 = element("h2");
    			t0 = space();
    			p0 = element("p");
    			p0.textContent = "To save time, I'm going to assume that your answer to the last question means you would probably lie down to some threshold reasonably close to 50% certainty of net-good outcomes. And listen: I'm sure there's some complexity here I'm missing, but the superficial implication of consequentialism-takes on lying is sort of that this is the right call; if you are optimizing for outcomes, you lie when it seems like it's going to make good outcomes. Whether or not I like the system, I get that this makes sense within it.";
    			t2 = space();
    			p1 = element("p");
    			p1.textContent = "With that said, we now have to take a short intermission to eliminate one last weird outlier: Would you lie if the chances of net-good consequences directly stemming from that lie were LESS than 50%?";
    			t4 = space();
    			p2 = element("p");
    			t5 = space();
    			p3 = element("p");
    			t6 = space();
    			p4 = element("p");
    			t7 = space();
    			create_component(exits.$$.fragment);
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t0, anchor);
    			insert(target, p0, anchor);
    			insert(target, t2, anchor);
    			insert(target, p1, anchor);
    			insert(target, t4, anchor);
    			insert(target, p2, anchor);
    			insert(target, t5, anchor);
    			insert(target, p3, anchor);
    			insert(target, t6, anchor);
    			insert(target, p4, anchor);
    			insert(target, t7, anchor);
    			mount_component(exits, target, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t0);
    			if (detaching) detach(p0);
    			if (detaching) detach(t2);
    			if (detaching) detach(p1);
    			if (detaching) detach(t4);
    			if (detaching) detach(p2);
    			if (detaching) detach(t5);
    			if (detaching) detach(p3);
    			if (detaching) detach(t6);
    			if (detaching) detach(p4);
    			if (detaching) detach(t7);
    			destroy_component(exits, detaching);
    		}
    	};
    }

    function instance$b($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Uncertainlie extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$b, create_fragment$b, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$uncertainlie$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Uncertainlie
    });

    /* adventure\uncertainlie2.svelte generated by Svelte v3.47.0 */

    function create_default_slot_2$3(ctx) {
    	let t0;
    	let i;
    	let t2;

    	return {
    		c() {
    			t0 = text("I didn't make the calculation based on nothing, man. The calculation ");
    			i = element("i");
    			i.textContent = "is";
    			t2 = text(" my decision.");
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, i, anchor);
    			insert(target, t2, anchor);
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(t0);
    			if (detaching) detach(i);
    			if (detaching) detach(t2);
    		}
    	};
    }

    // (20:1) <Link to=thedeferential>
    function create_default_slot_1$9(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("No, I'd respect their wishes.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (18:0) <Exits>
    function create_default_slot$9(ctx) {
    	let link0;
    	let t;
    	let link1;
    	let current;

    	link0 = new /*Link*/ ctx[0]({
    			props: {
    				to: "thegenius",
    				$$slots: { default: [create_default_slot_2$3] },
    				$$scope: { ctx }
    			}
    		});

    	link1 = new /*Link*/ ctx[0]({
    			props: {
    				to: "thedeferential",
    				$$slots: { default: [create_default_slot_1$9] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link0.$$.fragment);
    			t = space();
    			create_component(link1.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link0, target, anchor);
    			insert(target, t, anchor);
    			mount_component(link1, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link0_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link0_changes.$$scope = { dirty, ctx };
    			}

    			link0.$set(link0_changes);
    			const link1_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link1_changes.$$scope = { dirty, ctx };
    			}

    			link1.$set(link1_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link0.$$.fragment, local);
    			transition_in(link1.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link0.$$.fragment, local);
    			transition_out(link1.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link0, detaching);
    			if (detaching) detach(t);
    			destroy_component(link1, detaching);
    		}
    	};
    }

    function create_fragment$a(ctx) {
    	let p0;
    	let t1;
    	let p1;
    	let t3;
    	let p2;
    	let t5;
    	let exits;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$9] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			p0 = element("p");
    			p0.textContent = "One last thing: The preferences and opinions of of those you are lying to.";
    			t1 = space();
    			p1 = element("p");
    			p1.textContent = "You are working in a system of uncertainty. People disagree on things in uncertain systems, and one such disagreement you might run into is a a person who believes his utility is severely diminished by you lying to him. For instance, he may ask if a food contains a certain ingredient you think is harmless but he thinks is harmful. It might be something with lower or higher stakes than that.";
    			t3 = space();
    			p2 = element("p");
    			p2.textContent = "In instances where the person has made it clear they don't think they'd get net utility from you lying to them (and where no other factors but your and their utility is considered), do you consider your thought-out utility calculation to be more valid than theirs in a way that often would lead you to lie anyway?";
    			t5 = space();
    			create_component(exits.$$.fragment);
    		},
    		m(target, anchor) {
    			insert(target, p0, anchor);
    			insert(target, t1, anchor);
    			insert(target, p1, anchor);
    			insert(target, t3, anchor);
    			insert(target, p2, anchor);
    			insert(target, t5, anchor);
    			mount_component(exits, target, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(p0);
    			if (detaching) detach(t1);
    			if (detaching) detach(p1);
    			if (detaching) detach(t3);
    			if (detaching) detach(p2);
    			if (detaching) detach(t5);
    			destroy_component(exits, detaching);
    		}
    	};
    }

    function instance$a($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Uncertainlie2 extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$a, create_fragment$a, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$uncertainlie2$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Uncertainlie2
    });

    /* adventure\verminism.svelte generated by Svelte v3.47.0 */

    function create_default_slot_1$8(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("I want to try again! Back to the top!");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (28:0) <Exits>
    function create_default_slot$8(ctx) {
    	let link;
    	let current;

    	link = new /*Link*/ ctx[0]({
    			props: {
    				to: "Start",
    				$$slots: { default: [create_default_slot_1$8] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link_changes.$$scope = { dirty, ctx };
    			}

    			link.$set(link_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link, detaching);
    		}
    	};
    }

    function create_fragment$9(ctx) {
    	let h2;
    	let t1;
    	let p0;
    	let t3;
    	let p1;
    	let t9;
    	let p2;
    	let t11;
    	let p3;
    	let t17;
    	let p4;
    	let t19;
    	let p5;
    	let t21;
    	let exits;
    	let t22;
    	let a;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$8] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			h2 = element("h2");
    			h2.textContent = "You are an Ethics-of-Care Virtue Ethicist, which is basically just a Consequentialist.";
    			t1 = space();
    			p0 = element("p");
    			p0.textContent = "OK, so let's get a bit meta here.";
    			t3 = space();
    			p1 = element("p");
    			p1.innerHTML = `I&#39;ve been digging into various moral systems for a few months now as a bit of a refresher, and of deontology, consequentialism, and virtue ethics, virtue ethics is the one I understand the least. I think that&#39;s partially by design; virtue ethics isn&#39;t really a moral system as I usually understand it. Where deontology and consequentialism both seek to define <i>good,</i> virtue ethics really doesn&#39;t. Instead of this, it tells you to find or imagine someone who is successful, and do what they&#39;d do. Douglas Adams once created a character named Dirk Gently who would, rather than know where he was going, would find someone who was driving like they knew where <i>they</i> were going, and he&#39;d then just follow them hoping to get the same outcomes they looked set to get. This is a LOT like that.`;
    			t9 = space();
    			p2 = element("p");
    			p2.textContent = "Or rather it would be, except you chose the one side of virtue ethics that actually makes a more-than-half-hearted attempt to define virtues. The deal is that at some point feminists looked at the vaguely-defined virtues that most male philosophers picked, got pissed, and much more strictly defined a set of virtues they thought to be feminine-coded. That means that you've chosen a very specific set of virtues that all come down to nurture, care, and self sacrifice - essentially, the goodness of your actions is determined by how well they promote the good of \"helping James\".";
    			t11 = space();
    			p3 = element("p");
    			p3.innerHTML = `Fortunately or unfortunately, that means that your moral system is <i>identical in every way</i> to consequentialism. Where other forms of virtue ethicists look inwards at who they&#39;d like to be and act based off that, you <i>say</i> you are doing that, but then tether your moral goodness entirely to someone else&#39;s outcomes, such as you can influence them.`;
    			t17 = space();
    			p4 = element("p");
    			p4.textContent = "This isn't bad - for the record, I actually like this at least as much as other forms of virtue ethics.";
    			t19 = space();
    			p5 = element("p");
    			p5.textContent = "Your funny coded category name is CONCAVE.";
    			t21 = space();
    			create_component(exits.$$.fragment);
    			t22 = space();
    			a = element("a");
    			a.textContent = "I want to hear your post-writing-this thoughts! Back to the blog!";
    			attr(a, "href", "https://residentcontrarian.com");
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t1, anchor);
    			insert(target, p0, anchor);
    			insert(target, t3, anchor);
    			insert(target, p1, anchor);
    			insert(target, t9, anchor);
    			insert(target, p2, anchor);
    			insert(target, t11, anchor);
    			insert(target, p3, anchor);
    			insert(target, t17, anchor);
    			insert(target, p4, anchor);
    			insert(target, t19, anchor);
    			insert(target, p5, anchor);
    			insert(target, t21, anchor);
    			mount_component(exits, target, anchor);
    			insert(target, t22, anchor);
    			insert(target, a, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t1);
    			if (detaching) detach(p0);
    			if (detaching) detach(t3);
    			if (detaching) detach(p1);
    			if (detaching) detach(t9);
    			if (detaching) detach(p2);
    			if (detaching) detach(t11);
    			if (detaching) detach(p3);
    			if (detaching) detach(t17);
    			if (detaching) detach(p4);
    			if (detaching) detach(t19);
    			if (detaching) detach(p5);
    			if (detaching) detach(t21);
    			destroy_component(exits, detaching);
    			if (detaching) detach(t22);
    			if (detaching) detach(a);
    		}
    	};
    }

    function instance$9($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Verminism extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$9, create_fragment$9, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$verminism$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Verminism
    });

    /* adventure\virhero.svelte generated by Svelte v3.47.0 */

    function create_default_slot_3$2(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("They NEVER lie. They are a perfect person.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (24:1) <Link to=virseldomlie>
    function create_default_slot_2$2(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("They RARELY lie. They are a perfect person who adjusts his actions to suit the situation, but he has a strong bias towards truth.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (25:1) <Link to=viroftenlie>
    function create_default_slot_1$7(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("They OFTEN lie. They are a perfect person who considers things situationally, and acts mostly in accordance to what they think will produce great outcomes");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (22:0) <Exits>
    function create_default_slot$7(ctx) {
    	let link0;
    	let t0;
    	let link1;
    	let t1;
    	let link2;
    	let current;

    	link0 = new /*Link*/ ctx[0]({
    			props: {
    				to: "virneverlie",
    				$$slots: { default: [create_default_slot_3$2] },
    				$$scope: { ctx }
    			}
    		});

    	link1 = new /*Link*/ ctx[0]({
    			props: {
    				to: "virseldomlie",
    				$$slots: { default: [create_default_slot_2$2] },
    				$$scope: { ctx }
    			}
    		});

    	link2 = new /*Link*/ ctx[0]({
    			props: {
    				to: "viroftenlie",
    				$$slots: { default: [create_default_slot_1$7] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link0.$$.fragment);
    			t0 = space();
    			create_component(link1.$$.fragment);
    			t1 = space();
    			create_component(link2.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link0, target, anchor);
    			insert(target, t0, anchor);
    			mount_component(link1, target, anchor);
    			insert(target, t1, anchor);
    			mount_component(link2, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link0_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link0_changes.$$scope = { dirty, ctx };
    			}

    			link0.$set(link0_changes);
    			const link1_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link1_changes.$$scope = { dirty, ctx };
    			}

    			link1.$set(link1_changes);
    			const link2_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link2_changes.$$scope = { dirty, ctx };
    			}

    			link2.$set(link2_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link0.$$.fragment, local);
    			transition_in(link1.$$.fragment, local);
    			transition_in(link2.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link0.$$.fragment, local);
    			transition_out(link1.$$.fragment, local);
    			transition_out(link2.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link0, detaching);
    			if (detaching) detach(t0);
    			destroy_component(link1, detaching);
    			if (detaching) detach(t1);
    			destroy_component(link2, detaching);
    		}
    	};
    }

    function create_fragment$8(ctx) {
    	let h2;
    	let t0;
    	let p0;
    	let t2;
    	let p1;
    	let t4;
    	let p2;
    	let t6;
    	let p3;
    	let t8;
    	let exits;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$7] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			h2 = element("h2");
    			t0 = space();
    			p0 = element("p");
    			p0.textContent = "So you have this theoretical or actual role model who, basically, you trust to do things correctly; you look to what they do and imitate them. Got it. But the next relevant thing seems to be asking this: What kind of person are they?";
    			t2 = space();
    			p1 = element("p");
    			p1.textContent = "In this case, we could make arguments in favor of lying by saying \"My role model would probably err towards honesty here for the sake of being a reliable person.\". Or \"My role model would seek to peacekeep\", or even \"My role model tends to avoid hard truths at all costs because X\" where X is any reasoning that thinks that James should figure out about soap on his own time.";
    			t4 = space();
    			p2 = element("p");
    			p2.textContent = "What's the preference here?";
    			t6 = space();
    			p3 = element("p");
    			p3.textContent = "(Full disclosure: It doesn't matter that you picked an actual or theoretical third party here; it leads to the same options as if you didn't. I just wanted you to think about it.)";
    			t8 = space();
    			create_component(exits.$$.fragment);
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t0, anchor);
    			insert(target, p0, anchor);
    			insert(target, t2, anchor);
    			insert(target, p1, anchor);
    			insert(target, t4, anchor);
    			insert(target, p2, anchor);
    			insert(target, t6, anchor);
    			insert(target, p3, anchor);
    			insert(target, t8, anchor);
    			mount_component(exits, target, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t0);
    			if (detaching) detach(p0);
    			if (detaching) detach(t2);
    			if (detaching) detach(p1);
    			if (detaching) detach(t4);
    			if (detaching) detach(p2);
    			if (detaching) detach(t6);
    			if (detaching) detach(p3);
    			if (detaching) detach(t8);
    			destroy_component(exits, detaching);
    		}
    	};
    }

    function instance$8($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Virhero extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$8, create_fragment$8, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$virhero$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Virhero
    });

    /* adventure\virneverlie.svelte generated by Svelte v3.47.0 */

    function create_default_slot_1$6(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("I want to try again! Back to the top!");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (24:0) <Exits>
    function create_default_slot$6(ctx) {
    	let link;
    	let current;

    	link = new /*Link*/ ctx[0]({
    			props: {
    				to: "Start",
    				$$slots: { default: [create_default_slot_1$6] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link_changes.$$scope = { dirty, ctx };
    			}

    			link.$set(link_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link, detaching);
    		}
    	};
    }

    function create_fragment$7(ctx) {
    	let h2;
    	let t1;
    	let p0;
    	let t3;
    	let p1;
    	let t5;
    	let p2;
    	let t9;
    	let p3;
    	let t11;
    	let p4;
    	let t12;
    	let exits;
    	let t13;
    	let a;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$6] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			h2 = element("h2");
    			h2.textContent = "You are a Ideal-Seeking Anti-Lie Idealist.";
    			t1 = space();
    			p0 = element("p");
    			p0.textContent = "Basically you don't think lying is wrong so much as you think that people who lie aren't living their best lives or being the best people they could be. Every lie moves them further from that ideal, and thus every lie is wrong.";
    			t3 = space();
    			p1 = element("p");
    			p1.textContent = "There's a passage of the Bible (the book of James) that talks a bit about how works don't grant Christian salvation, but the kind of Faith that does grant access to salvation has other implications, one of which is motivating works. Your approach to lying is sort of like that; you don't care about lying that much, but you do care about being a really top-notch guy. If it turns out that really top-notch guys don't lie a lot (and you don't think they do), that motivates you to lie less.";
    			t5 = space();
    			p2 = element("p");
    			p2.innerHTML = `I can hear you saying something like &quot;this whole section is really lame and non-specific!&quot;, but I assure you that&#39;s not my fault. It turns out the whole field of virtue ethics is basically something like &quot;good people do things that good people do!&quot;, where &quot;good&quot; is defined in a way much closer to <i>successful and satisfied</i>. Essentially it asks you to imagine what you want people to say at your funeral, and work backwards from there. Whether you do this by imagining an idealized version of yourself or by following in the footsteps of an impressive rolemodel Wenceslas-style is mostly left up to you.`;
    			t9 = space();
    			p3 = element("p");
    			p3.textContent = "Most of this description is going to be copied to a few other variants on this theme with some minor tweaks. Don't be peeved at me.";
    			t11 = space();
    			p4 = element("p");
    			t12 = space();
    			create_component(exits.$$.fragment);
    			t13 = space();
    			a = element("a");
    			a.textContent = "I want to hear your post-writing-this thoughts! Back to the blog!";
    			attr(a, "href", "https://residentcontrarian.com");
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t1, anchor);
    			insert(target, p0, anchor);
    			insert(target, t3, anchor);
    			insert(target, p1, anchor);
    			insert(target, t5, anchor);
    			insert(target, p2, anchor);
    			insert(target, t9, anchor);
    			insert(target, p3, anchor);
    			insert(target, t11, anchor);
    			insert(target, p4, anchor);
    			insert(target, t12, anchor);
    			mount_component(exits, target, anchor);
    			insert(target, t13, anchor);
    			insert(target, a, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t1);
    			if (detaching) detach(p0);
    			if (detaching) detach(t3);
    			if (detaching) detach(p1);
    			if (detaching) detach(t5);
    			if (detaching) detach(p2);
    			if (detaching) detach(t9);
    			if (detaching) detach(p3);
    			if (detaching) detach(t11);
    			if (detaching) detach(p4);
    			if (detaching) detach(t12);
    			destroy_component(exits, detaching);
    			if (detaching) detach(t13);
    			if (detaching) detach(a);
    		}
    	};
    }

    function instance$7($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Virneverlie extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$7, create_fragment$7, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$virneverlie$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Virneverlie
    });

    /* adventure\viroftenlie.svelte generated by Svelte v3.47.0 */

    function create_default_slot_1$5(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("I want to try again! Back to the top!");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (24:0) <Exits>
    function create_default_slot$5(ctx) {
    	let link;
    	let current;

    	link = new /*Link*/ ctx[0]({
    			props: {
    				to: "Start",
    				$$slots: { default: [create_default_slot_1$5] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link_changes.$$scope = { dirty, ctx };
    			}

    			link.$set(link_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link, detaching);
    		}
    	};
    }

    function create_fragment$6(ctx) {
    	let h2;
    	let t1;
    	let p0;
    	let t3;
    	let p1;
    	let t5;
    	let p2;
    	let t9;
    	let p3;
    	let t11;
    	let p4;
    	let t12;
    	let exits;
    	let t13;
    	let a;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$5] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			h2 = element("h2");
    			h2.textContent = "You are a Ideal-Seeking Lie-comfortable Pragmatist.";
    			t1 = space();
    			p0 = element("p");
    			p0.textContent = "You don't think lying is wrong, full-stop. If your ideal image of yourself didn't lie much you'd think that lying a lot was wrong because it took you further and further from being that guy, but your ideal image of yourself is a pragmatist who leaves themselves with a lot of flexibility to deal with situations as they come on a one-off basis.";
    			t3 = space();
    			p1 = element("p");
    			p1.textContent = "There's a passage of the Bible (the book of James) that talks a bit about how works don't grant Christian salvation, but the kind of Faith that does grant access to salvation has other implications, one of which is motivating works. Your approach to lying is sort of like that; you don't care about lying that much, but you do care about being a really top-notch guy. Some closely related categories think that lying takes you further away from that; you think that being the kind of guy who produces good outcomes is more important, and that lying helps you do that.";
    			t5 = space();
    			p2 = element("p");
    			p2.innerHTML = `I can hear you saying something like &quot;this whole section is really lame and non-specific!&quot;, but I assure you that&#39;s not my fault. It turns out the whole field of virtue ethics is basically something like &quot;good people do things that good people do!&quot;, where &quot;good&quot; is defined in a way much closer to <i>successful and satisfied</i>. Essentially it asks you to imagine what you want people to say at your funeral, and work backwards from there. Whether you do this by imagining an idealized version of yourself or by following in the footsteps of an impressive rolemodel Wenceslas-style is mostly left up to you.`;
    			t9 = space();
    			p3 = element("p");
    			p3.textContent = "Most of this description is going to be copied to a few other variants on this theme with some minor tweaks. Don't be peeved at me.";
    			t11 = space();
    			p4 = element("p");
    			t12 = space();
    			create_component(exits.$$.fragment);
    			t13 = space();
    			a = element("a");
    			a.textContent = "I want to hear your post-writing-this thoughts! Back to the blog!";
    			attr(a, "href", "https://residentcontrarian.com");
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t1, anchor);
    			insert(target, p0, anchor);
    			insert(target, t3, anchor);
    			insert(target, p1, anchor);
    			insert(target, t5, anchor);
    			insert(target, p2, anchor);
    			insert(target, t9, anchor);
    			insert(target, p3, anchor);
    			insert(target, t11, anchor);
    			insert(target, p4, anchor);
    			insert(target, t12, anchor);
    			mount_component(exits, target, anchor);
    			insert(target, t13, anchor);
    			insert(target, a, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t1);
    			if (detaching) detach(p0);
    			if (detaching) detach(t3);
    			if (detaching) detach(p1);
    			if (detaching) detach(t5);
    			if (detaching) detach(p2);
    			if (detaching) detach(t9);
    			if (detaching) detach(p3);
    			if (detaching) detach(t11);
    			if (detaching) detach(p4);
    			if (detaching) detach(t12);
    			destroy_component(exits, detaching);
    			if (detaching) detach(t13);
    			if (detaching) detach(a);
    		}
    	};
    }

    function instance$6($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Viroftenlie extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$6, create_fragment$6, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$viroftenlie$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Viroftenlie
    });

    /* adventure\virseldomlie.svelte generated by Svelte v3.47.0 */

    function create_default_slot_1$4(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("I want to try again! Back to the top!");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (22:0) <Exits>
    function create_default_slot$4(ctx) {
    	let link;
    	let current;

    	link = new /*Link*/ ctx[0]({
    			props: {
    				to: "Start",
    				$$slots: { default: [create_default_slot_1$4] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link_changes.$$scope = { dirty, ctx };
    			}

    			link.$set(link_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link, detaching);
    		}
    	};
    }

    function create_fragment$5(ctx) {
    	let h2;
    	let t1;
    	let p0;
    	let t3;
    	let p1;
    	let t5;
    	let p2;
    	let t9;
    	let p3;
    	let t11;
    	let exits;
    	let t12;
    	let a;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$4] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			h2 = element("h2");
    			h2.textContent = "You are a Ideal-Seeking Anti-Lie Realist.";
    			t1 = space();
    			p0 = element("p");
    			p0.textContent = "Basically you don't think lying is wrong so much as you think that people who lie aren't living their best lives or being the best people they could be. As opposed to more absolutist versions of this general view on honesty, you don't think that this is universal; as opposed to more lax versions, you still think that lying is generally bad even if there's exceptions. Sometimes, you feel, a lie could be good if the situation called for it. But if you find that it calls for it a lot, you would introspect; after all, is the ideal person a known habitual liar?";
    			t3 = space();
    			p1 = element("p");
    			p1.textContent = "There's a passage of the Bible (the book of James) that talks a bit about how works don't grant Christian salvation, but the kind of Faith that does grant access to salvation has other implications, one of which is motivating works. Your approach to lying is sort of like that; you don't care about lying that much, but you do care about being a really top-notch guy. If it turns out that really top-notch guys don't lie a lot (and you don't think they do), that motivates you to lie less without actually convincing you that lies are the problem.";
    			t5 = space();
    			p2 = element("p");
    			p2.innerHTML = `I can hear you saying something like &quot;this whole section is really lame and non-specific!&quot;, but I assure you that&#39;s not my fault. It turns out the whole field of virtue ethics is basically something like &quot;good people do things that good people do!&quot;, where &quot;good&quot; is defined in a way much closer to <i>successful and satisfied</i>. Essentially it asks you to imagine what you want people to say at your funeral, and work backwards from there. Whether you do this by imagining an idealized version of yourself or by following in the footsteps of an impressive rolemodel Wenceslas-style is mostly left up to you.`;
    			t9 = space();
    			p3 = element("p");
    			p3.textContent = "Most of this description is going to be copied to a few other variants on this theme with some minor tweaks. Don't be peeved at me.";
    			t11 = space();
    			create_component(exits.$$.fragment);
    			t12 = space();
    			a = element("a");
    			a.textContent = "I want to hear your post-writing-this thoughts! Back to the blog!";
    			attr(a, "href", "https://residentcontrarian.com");
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t1, anchor);
    			insert(target, p0, anchor);
    			insert(target, t3, anchor);
    			insert(target, p1, anchor);
    			insert(target, t5, anchor);
    			insert(target, p2, anchor);
    			insert(target, t9, anchor);
    			insert(target, p3, anchor);
    			insert(target, t11, anchor);
    			mount_component(exits, target, anchor);
    			insert(target, t12, anchor);
    			insert(target, a, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t1);
    			if (detaching) detach(p0);
    			if (detaching) detach(t3);
    			if (detaching) detach(p1);
    			if (detaching) detach(t5);
    			if (detaching) detach(p2);
    			if (detaching) detach(t9);
    			if (detaching) detach(p3);
    			if (detaching) detach(t11);
    			destroy_component(exits, detaching);
    			if (detaching) detach(t12);
    			if (detaching) detach(a);
    		}
    	};
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Virseldomlie extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$5, create_fragment$5, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$virseldomlie$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Virseldomlie
    });

    /* adventure\virself.svelte generated by Svelte v3.47.0 */

    function create_default_slot_3$1(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("They NEVER lie. They are a perfect person.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (24:1) <Link to=virseldomlie>
    function create_default_slot_2$1(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("They RARELY lies. They are a perfect person who adjusts his actions to suit the situation, but he has a strong bias towards truth.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (25:1) <Link to=viroftenlie>
    function create_default_slot_1$3(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("They OFTEN lie. They are a perfect person who considers things situationally, and acts mostly in accordance to what they think will produce great outcomes");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (22:0) <Exits>
    function create_default_slot$3(ctx) {
    	let link0;
    	let t0;
    	let link1;
    	let t1;
    	let link2;
    	let current;

    	link0 = new /*Link*/ ctx[0]({
    			props: {
    				to: "virneverlie",
    				$$slots: { default: [create_default_slot_3$1] },
    				$$scope: { ctx }
    			}
    		});

    	link1 = new /*Link*/ ctx[0]({
    			props: {
    				to: "virseldomlie",
    				$$slots: { default: [create_default_slot_2$1] },
    				$$scope: { ctx }
    			}
    		});

    	link2 = new /*Link*/ ctx[0]({
    			props: {
    				to: "viroftenlie",
    				$$slots: { default: [create_default_slot_1$3] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link0.$$.fragment);
    			t0 = space();
    			create_component(link1.$$.fragment);
    			t1 = space();
    			create_component(link2.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link0, target, anchor);
    			insert(target, t0, anchor);
    			mount_component(link1, target, anchor);
    			insert(target, t1, anchor);
    			mount_component(link2, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link0_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link0_changes.$$scope = { dirty, ctx };
    			}

    			link0.$set(link0_changes);
    			const link1_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link1_changes.$$scope = { dirty, ctx };
    			}

    			link1.$set(link1_changes);
    			const link2_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link2_changes.$$scope = { dirty, ctx };
    			}

    			link2.$set(link2_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link0.$$.fragment, local);
    			transition_in(link1.$$.fragment, local);
    			transition_in(link2.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link0.$$.fragment, local);
    			transition_out(link1.$$.fragment, local);
    			transition_out(link2.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link0, detaching);
    			if (detaching) detach(t0);
    			destroy_component(link1, detaching);
    			if (detaching) detach(t1);
    			destroy_component(link2, detaching);
    		}
    	};
    }

    function create_fragment$4(ctx) {
    	let h2;
    	let t0;
    	let p0;
    	let t2;
    	let p1;
    	let t4;
    	let p2;
    	let t6;
    	let p3;
    	let t8;
    	let exits;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$3] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			h2 = element("h2");
    			t0 = space();
    			p0 = element("p");
    			p0.textContent = "So you have this version of yourself as you will eventually ideally be, and You look to what they do and imitate them. Got it. But the next relevant thing seems to be asking this: What kind of person are they?";
    			t2 = space();
    			p1 = element("p");
    			p1.textContent = "In this case, we could make arguments in favor of lying by saying \"My future self would probably err towards honesty here for the sake of being a reliable person.\". Or \"My future self would seek to peacekeep\", or even \"My future self tends to avoid hard truths at all costs because X\" where X is any reasoning that thinks that James should figure out about soap on his own time.";
    			t4 = space();
    			p2 = element("p");
    			p2.textContent = "What's the preference here?";
    			t6 = space();
    			p3 = element("p");
    			p3.textContent = "(Full disclosure: It doesn't matter that you picked an actual or theoretical third party here; it leads to the same options as if you didn't. I just wanted you to think about it.)";
    			t8 = space();
    			create_component(exits.$$.fragment);
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t0, anchor);
    			insert(target, p0, anchor);
    			insert(target, t2, anchor);
    			insert(target, p1, anchor);
    			insert(target, t4, anchor);
    			insert(target, p2, anchor);
    			insert(target, t6, anchor);
    			insert(target, p3, anchor);
    			insert(target, t8, anchor);
    			mount_component(exits, target, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t0);
    			if (detaching) detach(p0);
    			if (detaching) detach(t2);
    			if (detaching) detach(p1);
    			if (detaching) detach(t4);
    			if (detaching) detach(p2);
    			if (detaching) detach(t6);
    			if (detaching) detach(p3);
    			if (detaching) detach(t8);
    			destroy_component(exits, detaching);
    		}
    	};
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Virself extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$virself$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Virself
    });

    /* adventure\virtrack.svelte generated by Svelte v3.47.0 */

    function create_default_slot_3(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("I'm trying to figure out what the best version of myself would do. Like, I have a certain version of myself I hope to someday be, and I look for the action that works towards making me that person.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (26:1) <Link to=virhero>
    function create_default_slot_2(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("I imagine a heroically good person, real or hypothetical and then try to imagine what they'd do, and do that.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (27:1) <Link to=verminism>
    function create_default_slot_1$2(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("I try to think of what would be best for James - to nurture him, to help him to grow, and to get him to bathe.");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (24:0) <Exits>
    function create_default_slot$2(ctx) {
    	let link0;
    	let t0;
    	let link1;
    	let t1;
    	let link2;
    	let current;

    	link0 = new /*Link*/ ctx[0]({
    			props: {
    				to: "virself",
    				$$slots: { default: [create_default_slot_3] },
    				$$scope: { ctx }
    			}
    		});

    	link1 = new /*Link*/ ctx[0]({
    			props: {
    				to: "virhero",
    				$$slots: { default: [create_default_slot_2] },
    				$$scope: { ctx }
    			}
    		});

    	link2 = new /*Link*/ ctx[0]({
    			props: {
    				to: "verminism",
    				$$slots: { default: [create_default_slot_1$2] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link0.$$.fragment);
    			t0 = space();
    			create_component(link1.$$.fragment);
    			t1 = space();
    			create_component(link2.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link0, target, anchor);
    			insert(target, t0, anchor);
    			mount_component(link1, target, anchor);
    			insert(target, t1, anchor);
    			mount_component(link2, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link0_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link0_changes.$$scope = { dirty, ctx };
    			}

    			link0.$set(link0_changes);
    			const link1_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link1_changes.$$scope = { dirty, ctx };
    			}

    			link1.$set(link1_changes);
    			const link2_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link2_changes.$$scope = { dirty, ctx };
    			}

    			link2.$set(link2_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link0.$$.fragment, local);
    			transition_in(link1.$$.fragment, local);
    			transition_in(link2.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link0.$$.fragment, local);
    			transition_out(link1.$$.fragment, local);
    			transition_out(link2.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link0, detaching);
    			if (detaching) detach(t0);
    			destroy_component(link1, detaching);
    			if (detaching) detach(t1);
    			destroy_component(link2, detaching);
    		}
    	};
    }

    function create_fragment$3(ctx) {
    	let h2;
    	let t0;
    	let p0;
    	let t2;
    	let p1;
    	let t4;
    	let p2;
    	let t5;
    	let p3;
    	let t6;
    	let p4;
    	let t7;
    	let exits;
    	let current;

    	exits = new Exits({
    			props: {
    				$$slots: { default: [create_default_slot$2] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			h2 = element("h2");
    			t0 = space();
    			p0 = element("p");
    			p0.textContent = "OK, so imagine you are at a party, and James, a gross person, is asking you why the host didn't invite him to the party and he had to find out about it by seeing a bouncy castle as he drove by in his smelly, terrible car. James is the worst. Everyone knows it. You know it, the host knows it, the flies know it.";
    			t2 = space();
    			p1 = element("p");
    			p1.textContent = "Regardless of what you do and don't tell him, how are you making that decision?";
    			t4 = space();
    			p2 = element("p");
    			t5 = space();
    			p3 = element("p");
    			t6 = space();
    			p4 = element("p");
    			t7 = space();
    			create_component(exits.$$.fragment);
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t0, anchor);
    			insert(target, p0, anchor);
    			insert(target, t2, anchor);
    			insert(target, p1, anchor);
    			insert(target, t4, anchor);
    			insert(target, p2, anchor);
    			insert(target, t5, anchor);
    			insert(target, p3, anchor);
    			insert(target, t6, anchor);
    			insert(target, p4, anchor);
    			insert(target, t7, anchor);
    			mount_component(exits, target, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const exits_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				exits_changes.$$scope = { dirty, ctx };
    			}

    			exits.$set(exits_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(exits.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(exits.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t0);
    			if (detaching) detach(p0);
    			if (detaching) detach(t2);
    			if (detaching) detach(p1);
    			if (detaching) detach(t4);
    			if (detaching) detach(p2);
    			if (detaching) detach(t5);
    			if (detaching) detach(p3);
    			if (detaching) detach(t6);
    			if (detaching) detach(p4);
    			if (detaching) detach(t7);
    			destroy_component(exits, detaching);
    		}
    	};
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let { Link, state } = $$props;

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$invalidate(1, state = $$props.state);
    	};

    	return [Link, state];
    }

    class Virtrack extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, { Link: 0, state: 1 });
    	}
    }

    var adventure$47$virtrack$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Virtrack
    });

    /* adventure\helpers\ButtonThatLooksLikeALink.svelte generated by Svelte v3.47.0 */

    function add_css$2(target) {
    	append_styles(target, "svelte-c7ytuc", "button.svelte-c7ytuc{cursor:pointer;color:var(--blue);text-decoration:underline;background:transparent;border:none;padding:0}");
    }

    function create_fragment$2(ctx) {
    	let button;
    	let current;
    	let mounted;
    	let dispose;
    	const default_slot_template = /*#slots*/ ctx[1].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[0], null);

    	return {
    		c() {
    			button = element("button");
    			if (default_slot) default_slot.c();
    			attr(button, "class", "svelte-c7ytuc");
    		},
    		m(target, anchor) {
    			insert(target, button, anchor);

    			if (default_slot) {
    				default_slot.m(button, null);
    			}

    			current = true;

    			if (!mounted) {
    				dispose = listen(button, "click", /*click_handler*/ ctx[2]);
    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 1)) {
    					update_slot_base(
    						default_slot,
    						default_slot_template,
    						ctx,
    						/*$$scope*/ ctx[0],
    						!current
    						? get_all_dirty_from_scope(/*$$scope*/ ctx[0])
    						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[0], dirty, null),
    						null
    					);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(button);
    			if (default_slot) default_slot.d(detaching);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;

    	function click_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	$$self.$$set = $$props => {
    		if ('$$scope' in $$props) $$invalidate(0, $$scope = $$props.$$scope);
    	};

    	return [$$scope, slots, click_handler];
    }

    class ButtonThatLooksLikeALink extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, {}, add_css$2);
    	}
    }

    var adventure$47$helpers$47$ButtonThatLooksLikeALink$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': ButtonThatLooksLikeALink
    });

    /* adventure\helpers\Inventory.svelte generated by Svelte v3.47.0 */

    function add_css$1(target) {
    	append_styles(target, "svelte-1qwdu9i", "ul.svelte-1qwdu9i.svelte-1qwdu9i{padding:0;list-style-type:none;display:flex;flex-direction:column;gap:8px}[data-carrying=true].svelte-1qwdu9i.svelte-1qwdu9i{font-weight:700}[data-carrying=true].svelte-1qwdu9i .bullet.svelte-1qwdu9i{color:var(--green)}");
    }

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[6] = list[i].name;
    	child_ctx[7] = list[i].carrying;
    	return child_ctx;
    }

    // (30:5) {:else}
    function create_else_block_1$1(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("⃞");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (28:5) {#if carrying}
    function create_if_block_1$1(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("🅇");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (24:1) {#each inventory as { name, carrying }}
    function create_each_block$1(ctx) {
    	let li;
    	let span1;
    	let span0;
    	let t0;
    	let t1_value = /*name*/ ctx[6] + "";
    	let t1;
    	let span1_data_carrying_value;
    	let t2;

    	function select_block_type(ctx, dirty) {
    		if (/*carrying*/ ctx[7]) return create_if_block_1$1;
    		return create_else_block_1$1;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	return {
    		c() {
    			li = element("li");
    			span1 = element("span");
    			span0 = element("span");
    			if_block.c();
    			t0 = space();
    			t1 = text(t1_value);
    			t2 = space();
    			attr(span0, "class", "bullet svelte-1qwdu9i");
    			attr(span1, "data-carrying", span1_data_carrying_value = /*carrying*/ ctx[7]);
    			attr(span1, "class", "svelte-1qwdu9i");
    		},
    		m(target, anchor) {
    			insert(target, li, anchor);
    			append(li, span1);
    			append(span1, span0);
    			if_block.m(span0, null);
    			append(span1, t0);
    			append(span1, t1);
    			append(li, t2);
    		},
    		p(ctx, dirty) {
    			if (current_block_type !== (current_block_type = select_block_type(ctx))) {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(span0, null);
    				}
    			}

    			if (dirty & /*inventory*/ 4 && t1_value !== (t1_value = /*name*/ ctx[6] + "")) set_data(t1, t1_value);

    			if (dirty & /*inventory*/ 4 && span1_data_carrying_value !== (span1_data_carrying_value = /*carrying*/ ctx[7])) {
    				attr(span1, "data-carrying", span1_data_carrying_value);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(li);
    			if_block.d();
    		}
    	};
    }

    // (46:1) {:else}
    function create_else_block$1(ctx) {
    	let link;
    	let current;

    	link = new /*Link*/ ctx[0]({
    			props: {
    				to: "Start",
    				$$slots: { default: [create_default_slot_1$1] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link_changes = {};

    			if (dirty & /*$$scope*/ 1024) {
    				link_changes.$$scope = { dirty, ctx };
    			}

    			link.$set(link_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link, detaching);
    		}
    	};
    }

    // (42:1) {#if history.length > 1}
    function create_if_block$1(ctx) {
    	let button;
    	let current;

    	button = new ButtonThatLooksLikeALink({
    			props: {
    				class: "looks_like_a_link",
    				$$slots: { default: [create_default_slot$1] },
    				$$scope: { ctx }
    			}
    		});

    	button.$on("click", /*click_handler*/ ctx[4]);

    	return {
    		c() {
    			create_component(button.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(button, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const button_changes = {};

    			if (dirty & /*$$scope*/ 1024) {
    				button_changes.$$scope = { dirty, ctx };
    			}

    			button.$set(button_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(button.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(button.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(button, detaching);
    		}
    	};
    }

    // (47:2) <Link to=Start>
    function create_default_slot_1$1(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Close Inventory");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (43:2) <Button on:click={() => history.back()} class=looks_like_a_link>
    function create_default_slot$1(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Close Inventory");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    function create_fragment$1(ctx) {
    	let h2;
    	let t1;
    	let ul;
    	let t2;
    	let div;
    	let current_block_type_index;
    	let if_block;
    	let current;
    	let each_value = /*inventory*/ ctx[2];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	const if_block_creators = [create_if_block$1, create_else_block$1];
    	const if_blocks = [];

    	function select_block_type_1(ctx, dirty) {
    		if (history.length > 1) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type_1();
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c() {
    			h2 = element("h2");
    			h2.textContent = "Inventory";
    			t1 = space();
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t2 = space();
    			div = element("div");
    			if_block.c();
    			attr(ul, "class", "svelte-1qwdu9i");
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t1, anchor);
    			insert(target, ul, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}

    			insert(target, t2, anchor);
    			insert(target, div, anchor);
    			if_blocks[current_block_type_index].m(div, null);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*inventory*/ 4) {
    				each_value = /*inventory*/ ctx[2];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(ul, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if_block.p(ctx, dirty);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t1);
    			if (detaching) detach(ul);
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach(t2);
    			if (detaching) detach(div);
    			if_blocks[current_block_type_index].d();
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let inventory;

    	let $state,
    		$$unsubscribe_state = noop,
    		$$subscribe_state = () => ($$unsubscribe_state(), $$unsubscribe_state = subscribe(state, $$value => $$invalidate(3, $state = $$value)), state);

    	$$self.$$.on_destroy.push(() => $$unsubscribe_state());
    	let { Link, state } = $$props;
    	$$subscribe_state();

    	const item_names = {
    		eyeglasses_case: `Eyeglasses case`,
    		cat_eye_glasses: `Cat-eye glasses`,
    		bucket: `Bucket`,
    		broom: `Broom`,
    		homework: `Homework`,
    		book: `Book`
    	};

    	const click_handler = () => history.back();

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$subscribe_state($$invalidate(1, state = $$props.state));
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*$state*/ 8) {
    			$$invalidate(2, inventory = Object.entries(item_names).map(([identifier, name]) => ({
    				name,
    				carrying: $state.carrying[identifier]
    			})));
    		}
    	};

    	return [Link, state, inventory, $state, click_handler];
    }

    class Inventory extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { Link: 0, state: 1 }, add_css$1);
    	}
    }

    var adventure$47$helpers$47$Inventory$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Inventory
    });

    /* adventure\helpers\Score.svelte generated by Svelte v3.47.0 */

    function add_css(target) {
    	append_styles(target, "svelte-d3tjb5", "[data-achieved=true].svelte-d3tjb5.svelte-d3tjb5{font-weight:700}[data-achieved=true].svelte-d3tjb5 .bullet.svelte-d3tjb5{color:var(--green)}ul.svelte-d3tjb5.svelte-d3tjb5{padding:0;list-style-type:none;display:flex;flex-direction:column;gap:8px}li.svelte-d3tjb5.svelte-d3tjb5{display:flex;justify-content:space-between}.points.svelte-d3tjb5.svelte-d3tjb5{font-variant-numeric:tabular-nums}");
    }

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[8] = list[i].text;
    	child_ctx[9] = list[i].points;
    	child_ctx[10] = list[i].achieved;
    	return child_ctx;
    }

    // (58:5) {:else}
    function create_else_block_1(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("•");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (56:5) {#if achieved}
    function create_if_block_1(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("✔");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (52:1) {#each score_opportunities as {text, points, achieved}}
    function create_each_block(ctx) {
    	let li;
    	let span1;
    	let span0;
    	let t0;
    	let t1_value = /*text*/ ctx[8] + "";
    	let t1;
    	let t2;
    	let span2;
    	let t3_value = /*points*/ ctx[9] + "";
    	let t3;
    	let t4;
    	let li_data_achieved_value;

    	function select_block_type(ctx, dirty) {
    		if (/*achieved*/ ctx[10]) return create_if_block_1;
    		return create_else_block_1;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	return {
    		c() {
    			li = element("li");
    			span1 = element("span");
    			span0 = element("span");
    			if_block.c();
    			t0 = space();
    			t1 = text(t1_value);
    			t2 = space();
    			span2 = element("span");
    			t3 = text(t3_value);
    			t4 = space();
    			attr(span0, "class", "bullet svelte-d3tjb5");
    			attr(span2, "class", "points svelte-d3tjb5");
    			attr(li, "data-achieved", li_data_achieved_value = /*achieved*/ ctx[10]);
    			attr(li, "class", "svelte-d3tjb5");
    		},
    		m(target, anchor) {
    			insert(target, li, anchor);
    			append(li, span1);
    			append(span1, span0);
    			if_block.m(span0, null);
    			append(span1, t0);
    			append(span1, t1);
    			append(li, t2);
    			append(li, span2);
    			append(span2, t3);
    			append(li, t4);
    		},
    		p(ctx, dirty) {
    			if (current_block_type !== (current_block_type = select_block_type(ctx))) {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(span0, null);
    				}
    			}

    			if (dirty & /*score_opportunities*/ 4 && t1_value !== (t1_value = /*text*/ ctx[8] + "")) set_data(t1, t1_value);
    			if (dirty & /*score_opportunities*/ 4 && t3_value !== (t3_value = /*points*/ ctx[9] + "")) set_data(t3, t3_value);

    			if (dirty & /*score_opportunities*/ 4 && li_data_achieved_value !== (li_data_achieved_value = /*achieved*/ ctx[10])) {
    				attr(li, "data-achieved", li_data_achieved_value);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(li);
    			if_block.d();
    		}
    	};
    }

    // (83:1) {:else}
    function create_else_block(ctx) {
    	let link;
    	let current;

    	link = new /*Link*/ ctx[0]({
    			props: {
    				to: "Start",
    				$$slots: { default: [create_default_slot_1] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link_changes = {};

    			if (dirty & /*$$scope*/ 8192) {
    				link_changes.$$scope = { dirty, ctx };
    			}

    			link.$set(link_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link, detaching);
    		}
    	};
    }

    // (79:1) {#if history.length > 1}
    function create_if_block(ctx) {
    	let button;
    	let current;

    	button = new ButtonThatLooksLikeALink({
    			props: {
    				class: "looks_like_a_link",
    				$$slots: { default: [create_default_slot] },
    				$$scope: { ctx }
    			}
    		});

    	button.$on("click", /*click_handler*/ ctx[6]);

    	return {
    		c() {
    			create_component(button.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(button, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const button_changes = {};

    			if (dirty & /*$$scope*/ 8192) {
    				button_changes.$$scope = { dirty, ctx };
    			}

    			button.$set(button_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(button.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(button.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(button, detaching);
    		}
    	};
    }

    // (84:2) <Link to=Start>
    function create_default_slot_1(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Close Score");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (80:2) <Button on:click={() => history.back()} class=looks_like_a_link>
    function create_default_slot(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Close Score");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    function create_fragment(ctx) {
    	let h2;
    	let t1;
    	let ul;
    	let t2;
    	let div0;
    	let strong;
    	let t3;
    	let t4;
    	let t5;
    	let t6;
    	let t7;
    	let div1;
    	let current_block_type_index;
    	let if_block;
    	let current;
    	let each_value = /*score_opportunities*/ ctx[2];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const if_block_creators = [create_if_block, create_else_block];
    	const if_blocks = [];

    	function select_block_type_1(ctx, dirty) {
    		if (history.length > 1) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type_1();
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c() {
    			h2 = element("h2");
    			h2.textContent = "Score";
    			t1 = space();
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t2 = space();
    			div0 = element("div");
    			strong = element("strong");
    			t3 = text("Final score: ");
    			t4 = text(/*total_achieved*/ ctx[3]);
    			t5 = text(" / ");
    			t6 = text(/*total_possible*/ ctx[4]);
    			t7 = space();
    			div1 = element("div");
    			if_block.c();
    			attr(ul, "class", "svelte-d3tjb5");
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t1, anchor);
    			insert(target, ul, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}

    			insert(target, t2, anchor);
    			insert(target, div0, anchor);
    			append(div0, strong);
    			append(strong, t3);
    			append(strong, t4);
    			append(strong, t5);
    			append(strong, t6);
    			insert(target, t7, anchor);
    			insert(target, div1, anchor);
    			if_blocks[current_block_type_index].m(div1, null);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*score_opportunities*/ 4) {
    				each_value = /*score_opportunities*/ ctx[2];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(ul, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if (!current || dirty & /*total_achieved*/ 8) set_data(t4, /*total_achieved*/ ctx[3]);
    			if (!current || dirty & /*total_possible*/ 16) set_data(t6, /*total_possible*/ ctx[4]);
    			if_block.p(ctx, dirty);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t1);
    			if (detaching) detach(ul);
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach(t2);
    			if (detaching) detach(div0);
    			if (detaching) detach(t7);
    			if (detaching) detach(div1);
    			if_blocks[current_block_type_index].d();
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let score_opportunities;
    	let total_possible;
    	let total_achieved;

    	let $state,
    		$$unsubscribe_state = noop,
    		$$subscribe_state = () => ($$unsubscribe_state(), $$unsubscribe_state = subscribe(state, $$value => $$invalidate(5, $state = $$value)), state);

    	$$self.$$.on_destroy.push(() => $$unsubscribe_state());
    	let { Link, state } = $$props;
    	$$subscribe_state();
    	const sum_points = (total, { points }) => total + points;
    	const click_handler = () => history.back();

    	$$self.$$set = $$props => {
    		if ('Link' in $$props) $$invalidate(0, Link = $$props.Link);
    		if ('state' in $$props) $$subscribe_state($$invalidate(1, state = $$props.state));
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*$state*/ 32) {
    			$$invalidate(2, score_opportunities = [
    				{
    					text: `Retrieving the cat-eye glasses`,
    					points: 5,
    					achieved: $state.retrieved_the_cat_eye_glasses
    				},
    				{
    					text: `Sweeping up the hallway`,
    					points: 1,
    					achieved: $state.sweeped_up_the_hallway
    				},
    				{
    					text: `Rescuing the freshman`,
    					points: 1,
    					achieved: $state.rescued_the_freshman
    				},
    				{
    					text: `Returning the cat-eye glasses`,
    					points: 10,
    					achieved: $state.returned_the_cat_eye_glasses
    				},
    				{
    					text: `Unlocking your locker`,
    					points: 10,
    					achieved: $state.unlocked_your_locker
    				},
    				{
    					text: `...on the first try!`,
    					points: 2,
    					achieved: $state.unlocked_your_locker && $state.locker_unlock_attempts === 1
    				},
    				{
    					text: `Handing in your English homework`,
    					points: 20,
    					achieved: $state.handed_in_your_english_homework
    				},
    				{
    					text: `Finishing without saving`,
    					points: 1,
    					achieved: $state.handed_in_your_english_homework && $state.saves.length === 0
    				}
    			]);
    		}

    		if ($$self.$$.dirty & /*score_opportunities*/ 4) {
    			$$invalidate(4, total_possible = score_opportunities.reduce(sum_points, 0));
    		}

    		if ($$self.$$.dirty & /*score_opportunities*/ 4) {
    			$$invalidate(3, total_achieved = score_opportunities.filter(({ achieved }) => achieved).reduce(sum_points, 0));
    		}
    	};

    	return [
    		Link,
    		state,
    		score_opportunities,
    		total_achieved,
    		total_possible,
    		$state,
    		click_handler
    	];
    }

    class Score extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, { Link: 0, state: 1 }, add_css);
    	}
    }

    var adventure$47$helpers$47$Score$46$svelte = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': Score
    });

    var all_cyoa_components = [
    	{ path: 'adventure/Absolutes.svelte', export: adventure$47$Absolutes$46$svelte },
    	{ path: 'adventure/Antide.svelte', export: adventure$47$Antide$46$svelte },
    	{ path: 'adventure/Container.svelte', export: adventure$47$Container$46$svelte },
    	{ path: 'adventure/Contrack2.svelte', export: adventure$47$Contrack2$46$svelte },
    	{ path: 'adventure/Start.svelte', export: adventure$47$Start$46$svelte },
    	{ path: 'adventure/burn.svelte', export: adventure$47$burn$46$svelte },
    	{ path: 'adventure/burnburnburn.svelte', export: adventure$47$burnburnburn$46$svelte },
    	{ path: 'adventure/cartman.svelte', export: adventure$47$cartman$46$svelte },
    	{ path: 'adventure/conpsychic.svelte', export: adventure$47$conpsychic$46$svelte },
    	{ path: 'adventure/contrack.svelte', export: adventure$47$contrack$46$svelte },
    	{ path: 'adventure/contrack3.svelte', export: adventure$47$contrack3$46$svelte },
    	{ path: 'adventure/contrack4.svelte', export: adventure$47$contrack4$46$svelte },
    	{ path: 'adventure/conuncertain.svelte', export: adventure$47$conuncertain$46$svelte },
    	{ path: 'adventure/detrack.svelte', export: adventure$47$detrack$46$svelte },
    	{ path: 'adventure/detracklifelimb.svelte', export: adventure$47$detracklifelimb$46$svelte },
    	{ path: 'adventure/detrackmitigate.svelte', export: adventure$47$detrackmitigate$46$svelte },
    	{ path: 'adventure/detrackmuddle.svelte', export: adventure$47$detrackmuddle$46$svelte },
    	{ path: 'adventure/detracknaziactuallylie.svelte', export: adventure$47$detracknaziactuallylie$46$svelte },
    	{ path: 'adventure/detracknaziactuallytelltruth.svelte', export: adventure$47$detracknaziactuallytelltruth$46$svelte },
    	{ path: 'adventure/detracksometimesyousin.svelte', export: adventure$47$detracksometimesyousin$46$svelte },
    	{ path: 'adventure/detrackwhat.svelte', export: adventure$47$detrackwhat$46$svelte },
    	{ path: 'adventure/detrackwhat2.svelte', export: adventure$47$detrackwhat2$46$svelte },
    	{ path: 'adventure/detrackwhynot.svelte', export: adventure$47$detrackwhynot$46$svelte },
    	{ path: 'adventure/detractconfork.svelte', export: adventure$47$detractconfork$46$svelte },
    	{ path: 'adventure/knowledgedisregard.svelte', export: adventure$47$knowledgedisregard$46$svelte },
    	{ path: 'adventure/knowledgerespect.svelte', export: adventure$47$knowledgerespect$46$svelte },
    	{ path: 'adventure/netneglie.svelte', export: adventure$47$netneglie$46$svelte },
    	{ path: 'adventure/nouncertainlie.svelte', export: adventure$47$nouncertainlie$46$svelte },
    	{ path: 'adventure/oliempics.svelte', export: adventure$47$oliempics$46$svelte },
    	{ path: 'adventure/oliempics2.svelte', export: adventure$47$oliempics2$46$svelte },
    	{ path: 'adventure/scalesofgood.svelte', export: adventure$47$scalesofgood$46$svelte },
    	{ path: 'adventure/thedeferential.svelte', export: adventure$47$thedeferential$46$svelte },
    	{ path: 'adventure/thegenius.svelte', export: adventure$47$thegenius$46$svelte },
    	{ path: 'adventure/uncertainlie.svelte', export: adventure$47$uncertainlie$46$svelte },
    	{ path: 'adventure/uncertainlie2.svelte', export: adventure$47$uncertainlie2$46$svelte },
    	{ path: 'adventure/verminism.svelte', export: adventure$47$verminism$46$svelte },
    	{ path: 'adventure/virhero.svelte', export: adventure$47$virhero$46$svelte },
    	{ path: 'adventure/virneverlie.svelte', export: adventure$47$virneverlie$46$svelte },
    	{ path: 'adventure/viroftenlie.svelte', export: adventure$47$viroftenlie$46$svelte },
    	{ path: 'adventure/virseldomlie.svelte', export: adventure$47$virseldomlie$46$svelte },
    	{ path: 'adventure/virself.svelte', export: adventure$47$virself$46$svelte },
    	{ path: 'adventure/virtrack.svelte', export: adventure$47$virtrack$46$svelte },
    	{ path: 'adventure/helpers/Action.svelte', export: adventure$47$helpers$47$Action$46$svelte },
    	{ path: 'adventure/helpers/Blue.svelte', export: adventure$47$helpers$47$Blue$46$svelte },
    	{ path: 'adventure/helpers/ButtonThatLooksLikeALink.svelte', export: adventure$47$helpers$47$ButtonThatLooksLikeALink$46$svelte },
    	{ path: 'adventure/helpers/Exits.svelte', export: adventure$47$helpers$47$Exits$46$svelte },
    	{ path: 'adventure/helpers/Inventory.svelte', export: adventure$47$helpers$47$Inventory$46$svelte },
    	{ path: 'adventure/helpers/Save.svelte', export: adventure$47$helpers$47$Save$46$svelte },
    	{ path: 'adventure/helpers/Score.svelte', export: adventure$47$helpers$47$Score$46$svelte }
    ];

    const basename = path => {
    	const file = path.split(/[\/\\]/g).pop();
    	return file.split(`.`).slice(0, -1).join(`.`)
    };

    const start_import = all_cyoa_components.find(({ path }) => path.endsWith(`Start.svelte`));
    const container_import = all_cyoa_components.find(({ path }) => path.endsWith(`Container.svelte`));

    if (!start_import) {
    	console.error(`You need a "Start.svelte" file`);
    } else if (!container_import) {
    	console.error(`You need a "Container.svelte" file`);
    } else {
    	const name_to_id = Object.fromEntries(all_cyoa_components.map(({ path }) => {
    		const name = basename(path);

    		return [
    			name,
    			rot13(name),
    		]
    	}));

    	const id_to_name = Object.fromEntries(all_cyoa_components.map(({ path }) => {
    		const name = basename(path);

    		return [
    			rot13(name),
    			name,
    		]
    	}));

    	const id_to_component = Object.fromEntries(all_cyoa_components.map(({ path, export: { default: component } }) => {
    		const name = basename(path);
    		const id = name_to_id[name];

    		return [
    			id,
    			component,
    		]
    	}));

    	new Wrapper({
    		target: document.body,
    		props: {
    			Container: container_import.export.default,
    			name_to_id,
    			id_to_name,
    			id_to_component,
    			page_id_param: param_store({ param_name: `page` }),
    			adventure_state: object_serializer_store({
    				param_name: `state`,
    				replace: true,
    				default_values: start_import.export.initial_state,
    				serialize: to_obfuscated_json,
    				deserialize: from_obfuscated_json,
    			}),
    		},
    	});
    }

})();
//# sourceMappingURL=bundle.js.map
