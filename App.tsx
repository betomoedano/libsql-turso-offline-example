import { useState, useEffect, useCallback } from "react";
import {
  Button,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SQLiteProvider,
  useSQLiteContext,
  type SQLiteDatabase,
} from "expo-sqlite";

/**
 * The Item type represents a single item in database.
 */
interface ItemEntity {
  id: number;
  done: boolean;
  value: string;
}

const libSQLOptions = {
  url: process.env.EXPO_PUBLIC_LIBSQL_URL,
  authToken: process.env.EXPO_PUBLIC_LIBSQL_AUTH_TOKEN,
};

//#region Components

export default function App() {
  return (
    <SQLiteProvider
      databaseName="offline.db"
      onInit={migrateDbIfNeeded}
      options={{ libSQLOptions }}
    >
      <Main />
      <StatusBar barStyle="dark-content" />
    </SQLiteProvider>
  );
}

function Main() {
  const db = useSQLiteContext();
  const [text, setText] = useState("");
  const [todoItems, setTodoItems] = useState<ItemEntity[]>([]);
  const [doneItems, setDoneItems] = useState<ItemEntity[]>([]);
  const [enablePollingSync, setEnablePollingSync] = useState(false);

  const refetchItems = useCallback(() => {
    async function refetch() {
      await db.withTransactionAsync(async () => {
        setTodoItems(
          await db.getAllAsync<ItemEntity>(
            "SELECT * FROM items WHERE done = ?",
            false
          )
        );
        setDoneItems(
          await db.getAllAsync<ItemEntity>(
            "SELECT * FROM items WHERE done = ?",
            true
          )
        );
      });
    }
    refetch();
  }, [db]);

  const sync = useCallback(
    (refetch: boolean) => {
      db.syncLibSQL();
      if (refetch) {
        refetchItems();
      }
    },
    [db]
  );

  useEffect(() => {
    refetchItems();
  }, []);

  useEffect(() => {
    if (enablePollingSync) {
      const intervalId = setInterval(() => {
        sync(true /* refetch */);
      }, 2000);
      return () => {
        clearInterval(intervalId);
      };
    }
  }, [enablePollingSync]);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Tasks</Text>

      <View style={styles.controlContainer}>
        <View style={styles.controlRow}>
          <Text style={styles.controlText}>Manual sync</Text>
          <TouchableOpacity
            style={styles.syncButton}
            onPress={() => sync(true)}
          >
            <Text style={styles.syncButtonText}>Sync Now</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.controlRow}>
          <Text style={styles.controlText}>Auto sync every 2s</Text>
          <Switch
            onValueChange={setEnablePollingSync}
            value={enablePollingSync}
            trackColor={{ false: "#767577", true: "#81b0ff" }}
            thumbColor={enablePollingSync ? "#2196F3" : "#f4f3f4"}
          />
        </View>
      </View>

      <View style={styles.inputContainer}>
        <TextInput
          onChangeText={setText}
          onSubmitEditing={async () => {
            await addItemAsync(db, text);
            refetchItems();
            setText("");
          }}
          placeholder="Add a new task..."
          placeholderTextColor="#666"
          style={styles.input}
          value={text}
        />
      </View>

      <ScrollView style={styles.listArea} showsVerticalScrollIndicator={false}>
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionHeading}>Pending Tasks</Text>
          {todoItems.map((item) => (
            <Item
              key={item.id}
              item={item}
              onPressItem={async (id) => {
                await updateItemAsDoneAsync(db, id);
                refetchItems();
              }}
            />
          ))}
        </View>
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionHeading}>Completed</Text>
          {doneItems.map((item) => (
            <Item
              key={item.id}
              item={item}
              onPressItem={async (id) => {
                await deleteItemAsync(db, id);
                refetchItems();
              }}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function Item({
  item,
  onPressItem,
}: {
  item: ItemEntity;
  onPressItem: (id) => void | Promise<void>;
}) {
  const { id, done, value } = item;
  return (
    <TouchableOpacity
      onPress={() => onPressItem && onPressItem(id)}
      style={[styles.item, done && styles.itemDone]}
    >
      <Text style={[styles.itemText, done && styles.itemTextDone]}>
        {value}
      </Text>
    </TouchableOpacity>
  );
}

//#endregion

//#region Database Operations

async function addItemAsync(db: SQLiteDatabase, text: string): Promise<void> {
  if (text !== "") {
    await db.runAsync(
      "INSERT INTO items (done, value) VALUES (?, ?);",
      false,
      text
    );
  }
}

async function updateItemAsDoneAsync(
  db: SQLiteDatabase,
  id: number
): Promise<void> {
  await db.runAsync("UPDATE items SET done = ? WHERE id = ?;", true, id);
}

async function deleteItemAsync(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync("DELETE FROM items WHERE id = ?;", id);
}

async function migrateDbIfNeeded(db: SQLiteDatabase) {
  // Always sync libSQL first to prevent conflicts between local and remote databases
  db.syncLibSQL();

  const DATABASE_VERSION = 1;
  let { user_version: currentDbVersion } = await db.getFirstAsync<{
    user_version: number;
  }>("PRAGMA user_version");
  if (currentDbVersion >= DATABASE_VERSION) {
    return;
  }
  if (currentDbVersion === 0) {
    // libSQL does not support WAL mode
    // await db.execAsync(`PRAGMA journal_mode = 'wal';`);
    await db.execAsync(
      `CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY NOT NULL, done INT, value TEXT);`
    );
    currentDbVersion = 1;
  }
  // if (currentDbVersion === 1) {
  //   Add more migrations
  // }
  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}

//#endregion

//#region Styles

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#F5F6FA",
    flex: 1,
    paddingTop: 64,
  },
  heading: {
    fontSize: 32,
    fontWeight: "700",
    textAlign: "center",
    color: "#1A1A1A",
    marginBottom: 20,
  },
  flexRow: {
    flexDirection: "row",
  },
  controlContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 15,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  controlRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  controlText: {
    fontSize: 16,
    color: "#1A1A1A",
    fontWeight: "500",
  },
  syncButton: {
    backgroundColor: "#2196F3",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  syncButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  inputContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  listArea: {
    flex: 1,
    paddingHorizontal: 16,
  },
  sectionContainer: {
    marginBottom: 24,
  },
  sectionHeading: {
    fontSize: 20,
    fontWeight: "600",
    color: "#1A1A1A",
    marginBottom: 12,
  },
  item: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
  },
  itemDone: {
    backgroundColor: "#4CAF50",
  },
  itemText: {
    fontSize: 16,
    color: "#1A1A1A",
  },
  itemTextDone: {
    color: "#FFFFFF",
    textDecorationLine: "line-through",
  },
});

//#endregion
