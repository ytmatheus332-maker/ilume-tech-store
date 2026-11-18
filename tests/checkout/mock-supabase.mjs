let databaseState = null;

export function setCheckoutDatabaseState(nextState) {
  databaseState = nextState;
}

function matches(row, filters) {
  return Object.entries(filters).every(([key, value]) => {
    if (value && typeof value === "object" && Array.isArray(value.in)) {
      return value.in.includes(row?.[key]);
    }

    return row?.[key] === value;
  });
}

export function createClient() {
  return {
    auth: {
      async getUser(token) {
        const user = token === "test-owner-token" ? databaseState.user : null;
        return { data: { user }, error: null };
      }
    },
    rpc(name, parameters) {
      databaseState.lastRpc = { name, parameters };
      return Promise.resolve({
        data: databaseState.rpcResult || { received: true },
        error: null
      });
    },
    from(table) {
      let operation = "select";
      let payload = null;
      let filters = {};
      let conflictOptions;

      const execute = async (single = false) => {
        if (databaseState?.failOperation === table + ":" + operation) {
          return { data: null, error: { code: "MOCK_DATABASE_FAILURE" } };
        }

        if (table === "payment_settings" && operation === "select") {
          return {
            data: single
              ? { active_gateway: databaseState.gateway }
              : [{ active_gateway: databaseState.gateway }],
            error: null
          };
        }

        if (table === "ilume_user_roles" && operation === "select") {
          return { data: matches(databaseState.role, filters) ? databaseState.role : null, error: null };
        }

        if (table === "payment_settings" && operation === "update") {
          databaseState.gateway = payload.active_gateway;
          return { data: { id: 1, ...payload }, error: null };
        }

        if (table === "product_variants" && operation === "select") {
          return { data: databaseState.variants, error: null };
        }

        if (table === "orders" && operation === "upsert") {
          databaseState.lastOrderUpsert = conflictOptions;
          if (
            databaseState.checkoutRequestUnique === false ||
            conflictOptions?.onConflict !== "checkout_request_id" ||
            conflictOptions?.ignoreDuplicates !== true
          ) {
            return { data: null, error: { code: "42P10" } };
          }
          if (databaseState.order?.checkout_request_id === payload.checkout_request_id) {
            return { data: null, error: null };
          }
        }

        if (table === "orders" && (operation === "insert" || operation === "upsert")) {
          if (databaseState.order) {
            return { data: null, error: { code: "23505" } };
          }

          const row = Array.isArray(payload) ? payload[0] : payload;
          databaseState.order = {
            id: "order-mock-1",
            ...row,
            created_at: new Date().toISOString(),
            preference_id: null,
            gateway_payment_id: null
          };

          return { data: { ...databaseState.order }, error: null };
        }

        if (table === "orders" && operation === "select") {
          const row = matches(databaseState.order, filters)
            ? { ...databaseState.order }
            : null;
          return {
            data: single ? row : row ? [row] : [],
            error: null
          };
        }

        if (table === "order_items" && operation === "insert") {
          databaseState.items = Array.isArray(payload) ? payload : [payload];
          return { data: null, error: null };
        }

        if (table === "order_items" && operation === "select") {
          return {
            data: databaseState.items.filter((row) =>
              matches(row, filters)
            ),
            error: null
          };
        }

        if (table === "order_addresses" && operation === "select") {
          return {
            data: matches(databaseState.address, filters) ? databaseState.address : null,
            error: null
          };
        }

        if (table === "order_addresses" && operation === "insert") {
          if (databaseState.address) {
            return { data: null, error: { code: "23505" } };
          }
          databaseState.address = payload;
          return { data: null, error: null };
        }

        if (table === "orders" && operation === "update") {
          if (!matches(databaseState.order, filters)) {
            return { data: null, error: null };
          }

          Object.assign(databaseState.order, payload);
          return { data: { id: databaseState.order.id }, error: null };
        }

        return {
          data: null,
          error: { code: "MOCK_UNHANDLED_QUERY", message: table + ":" + operation }
        };
      };

      const query = {
        select() {
          return query;
        },
        eq(key, value) {
          filters[key] = value;
          return query;
        },
        is(key, value) {
          filters[key] = value;
          return query;
        },
        in(key, value) {
          filters[key] = { in: value };
          return query;
        },
        insert(value) {
          operation = "insert";
          payload = value;
          return query;
        },
        upsert(value, options) {
          operation = "upsert";
          payload = value;
          conflictOptions = options;
          return query;
        },
        update(value) {
          operation = "update";
          payload = value;
          return query;
        },
        single() {
          return execute(true);
        },
        maybeSingle() {
          return execute(true);
        },
        then(resolve, reject) {
          return execute(false).then(resolve, reject);
        }
      };

      return query;
    }
  };
}

