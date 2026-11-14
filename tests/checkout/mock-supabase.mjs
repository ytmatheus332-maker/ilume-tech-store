let databaseState = null;

export function setCheckoutDatabaseState(nextState) {
  databaseState = nextState;
}

function matches(row, filters) {
  return Object.entries(filters).every(([key, value]) => row?.[key] === value);
}

export function createClient() {
  return {
    from(table) {
      let operation = "select";
      let payload = null;
      let filters = {};

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

        if (table === "product_variants" && operation === "select") {
          return { data: databaseState.variants, error: null };
        }

        if (table === "orders" && operation === "insert") {
          if (databaseState.order) {
            return { data: null, error: { code: "23505" } };
          }

          const row = Array.isArray(payload) ? payload[0] : payload;
          databaseState.order = {
            id: "order-mock-1",
            ...row,
            gateway_payment_id: null
          };

          return { data: databaseState.order, error: null };
        }

        if (table === "orders" && operation === "select") {
          const row = matches(databaseState.order, filters)
            ? databaseState.order
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
        in(key, value) {
          filters[key] = { in: value };
          return query;
        },
        insert(value) {
          operation = "insert";
          payload = value;
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
