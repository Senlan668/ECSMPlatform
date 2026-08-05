package cn.hollis.llm.mentor.agent.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 适配Spring MVC的跨域配置类
 * 同时处理favicon.ico静态资源映射，避免报错
 */
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    // 配置静态资源，解决favicon.ico报错
    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // 1. 优先映射favicon.ico，即使文件不存在也不会抛出ERROR级异常
        registry.addResourceHandler("/favicon.ico")
                .addResourceLocations("classpath:/static/")
                .setCachePeriod(0); // 禁用缓存，方便测试

        // 2. 配置默认静态资源（Spring MVC默认也会处理，但显式配置更清晰）
        registry.addResourceHandler("/**")
                .addResourceLocations("classpath:/static/", "classpath:/public/");
    }
}
