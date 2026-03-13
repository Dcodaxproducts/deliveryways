-- CreateTable
CREATE TABLE "restaurant_menus" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "restaurant_menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_menu_items" (
    "id" TEXT NOT NULL,
    "restaurant_menu_id" TEXT NOT NULL,
    "menu_item_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "restaurant_menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_menus_restaurant_id_slug_key" ON "restaurant_menus"("restaurant_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_menu_items_restaurant_menu_id_menu_item_id_key" ON "restaurant_menu_items"("restaurant_menu_id", "menu_item_id");

-- AddForeignKey
ALTER TABLE "restaurant_menus" ADD CONSTRAINT "restaurant_menus_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_menu_items" ADD CONSTRAINT "restaurant_menu_items_restaurant_menu_id_fkey" FOREIGN KEY ("restaurant_menu_id") REFERENCES "restaurant_menus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_menu_items" ADD CONSTRAINT "restaurant_menu_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
