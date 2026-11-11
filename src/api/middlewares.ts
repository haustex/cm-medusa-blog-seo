import { defineMiddlewares, validateAndTransformBody, validateAndTransformQuery } from "@medusajs/framework/http"
import multer from "multer"
import { AdminAuthorBody, AdminCategoryBody, AdminListPosts, AdminPostBody, AdminPublishBody, AdminSettingsBody, StoreListPosts, StoreLocaleQuery } from "./validators"

// Multipart uploads (field "files"); JSON data-URL uploads pass through untouched. The size is re-checked in the route.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024, files: 10 } })

export default defineMiddlewares({
  routes: [
    { matcher: "/store/blog-seo/posts", method: "GET", middlewares: [validateAndTransformQuery(StoreListPosts, {})] },
    { matcher: "/store/blog-seo/posts/:slug", method: "GET", middlewares: [validateAndTransformQuery(StoreLocaleQuery, {})] },
    { matcher: "/store/blog-seo/categories", method: "GET", middlewares: [validateAndTransformQuery(StoreLocaleQuery, {})] },
    { matcher: "/store/blog-seo/authors*", method: "GET", middlewares: [validateAndTransformQuery(StoreLocaleQuery, {})] },
    { matcher: "/store/blog-seo/preview/:token", method: "GET", middlewares: [validateAndTransformQuery(StoreLocaleQuery, {})] },
    { matcher: "/admin/blog-seo/posts", method: "GET", middlewares: [validateAndTransformQuery(AdminListPosts, {})] },
    // article bodies in every locale travel in one request
    { matcher: "/admin/blog-seo/posts", method: "POST", bodyParser: { sizeLimit: "24mb" }, middlewares: [validateAndTransformBody(AdminPostBody)] },
    { matcher: "/admin/blog-seo/posts/:id", method: "POST", bodyParser: { sizeLimit: "24mb" }, middlewares: [validateAndTransformBody(AdminPostBody)] },
    { matcher: "/admin/blog-seo/posts/:id/publish", method: "POST", middlewares: [validateAndTransformBody(AdminPublishBody)] },
    { matcher: "/admin/blog-seo/categories", method: "POST", middlewares: [validateAndTransformBody(AdminCategoryBody)] },
    { matcher: "/admin/blog-seo/categories/:id", method: "POST", middlewares: [validateAndTransformBody(AdminCategoryBody)] },
    { matcher: "/admin/blog-seo/authors", method: "POST", middlewares: [validateAndTransformBody(AdminAuthorBody)] },
    { matcher: "/admin/blog-seo/authors/:id", method: "POST", middlewares: [validateAndTransformBody(AdminAuthorBody)] },
    { matcher: "/admin/blog-seo/settings", method: "POST", middlewares: [validateAndTransformBody(AdminSettingsBody)] },
    { matcher: "/admin/blog-seo/uploads", method: "POST", bodyParser: { sizeLimit: "40mb" }, middlewares: [upload.array("files")] },
  ],
})
